const fs = require('fs');
const path = require('path');
const envPath = path.resolve(__dirname, '../.env');
const exampleEnvPath = path.resolve(__dirname, '../.env.example');
require('dotenv').config({
  path: fs.existsSync(envPath) ? envPath : exampleEnvPath,
  override: true,
});

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const sql = require('mssql');
const jwt = require('jsonwebtoken');
const { getPool, ensureAuthTables } = require('./config/db');
const { cancelExpiredBookings } = require('./dao/bookingDao');
// Seed data đã được tắt để dùng dữ liệu mẫu bạn insert trực tiếp trong SQL Server.
const { getHomeData, getRoomTypes, getRoomTypeDetails, getPromotions, getServices, getActiveServiceById, getReviews } = require('./controllers/homeController');
const { register, login, logout, verifyEmail, forgotPassword, resetPassword } = require('./controllers/authController');
const { checkAvailability, getAvailableRooms } = require('./controllers/roomController');
const { createCustomerBookingHandler, checkInBookingHandler, createWalkInBookingHandler, getRecentBookingsHandler, getBookingHistoryHandler, updateBookingHandler, cancelBookingHandler, getActiveBookingsHandler, checkOutBookingHandler, finishRoomCleaningHandler, getRoomStatusesHandler, getAssignableRoomsHandler, assignRoomHandler } = require('./controllers/bookingController');
const serviceController = require('./controllers/serviceController');
const { requireCustomer, requirePaymentStaff, requirePaymentActor } = require('./middleware/customerAuth');
const { createPayment, getPaymentList, getCustomerPaymentList, getPaymentStatusRequest, confirmPaymentRequest } = require('./controllers/paymentController');
const { handleVnpayReturn, handleVnpayIpn } = require('./controllers/vnpayController');
const bookingServiceController = require('./controllers/bookingServiceController');
const app = express();
const PORT = 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'hotel-management-secret';
const uploadsDir = path.join(__dirname, '../uploads');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('Chỉ chấp nhận ảnh JPG, PNG, WEBP.'));
  },
});

function requireAdmin(req, res, next) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';

  if (!token) {
    return res.status(401).json({ message: 'Vui lòng đăng nhập để tiếp tục.' });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);
    if (user.role_code !== 'ADMIN') {
      return res.status(403).json({ message: 'Chỉ quản trị viên được tải ảnh loại phòng.' });
    }
    return next();
  } catch {
    return res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
  }
}

app.use(cors());
app.use(express.json());
// Giữ phục vụ các ảnh cũ trong lúc chuyển chúng từ ổ đĩa vào SQL Server.
app.use('/uploads', express.static(uploadsDir));

// Kiểm tra trạng thái backend đang chạy
app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'Hotel backend is running' });
});

// --- Authentication APIs ---
// Đăng ký tài khoản mới cho khách hàng
app.post('/api/auth/register', register);
// Đăng nhập hệ thống bằng email và mật khẩu
app.post('/api/auth/login', login);
// Đăng xuất và revoke refresh token hiện tại
app.post('/api/auth/logout', logout);
// Xác thực email sau khi tài khoản mới được tạo
app.get('/api/auth/verify-email', verifyEmail);

// Quên mật khẩu
app.post('/api/auth/forgot-password', forgotPassword);

// Đặt lại mật khẩu bằng OTP
app.post('/api/auth/reset-password', resetPassword);
// --- Frontend home data APIs ---
// Lấy dữ liệu tổng hợp cho trang chủ
app.get('/api/home', getHomeData);
// Lấy danh sách loại phòng để render UI
app.get('/api/room-types', getRoomTypes);
app.get('/api/room-types/:roomTypeId', getRoomTypeDetails);
// Chỉ admin được tạo loại phòng (UC-04.1).
app.post('/api/room-types', async (req, res) => {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';

  if (!token) {
    return res.status(401).json({ message: 'Vui lòng đăng nhập để tiếp tục.' });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);
    if (user.role_code !== 'ADMIN') {
      return res.status(403).json({ message: 'Chỉ quản trị viên được thêm loại phòng.' });
    }
  } catch {
    return res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
  }

  const { name, description, base_price, max_adults, max_children } = req.body || {};
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  const price = Number(base_price);
  const adults = Number(max_adults);
  const children = Number(max_children);

  if (!normalizedName || normalizedName.length > 100) {
    return res.status(400).json({ message: 'Tên loại phòng là bắt buộc và tối đa 100 ký tự.' });
  }
  if (!Number.isFinite(price) || price < 0 || !Number.isFinite(adults) || !Number.isInteger(adults) || adults < 1 || adults > 255 || !Number.isFinite(children) || !Number.isInteger(children) || children < 0 || children > 255) {
    return res.status(400).json({ message: 'Giá phải từ 0 trở lên; sức chứa người lớn phải từ 1 và các sức chứa phải là số nguyên hợp lệ.' });
  }
  if (description != null && typeof description !== 'string') {
    return res.status(400).json({ message: 'Mô tả không hợp lệ.' });
  }

  try {
    const pool = await getPool();
    const existingType = await pool.request()
      .input('name', sql.NVarChar(100), normalizedName)
      .query('SELECT TOP (1) id FROM room_types WHERE LOWER(LTRIM(RTRIM(name))) = LOWER(@name);');
    if (existingType.recordset.length > 0) {
      return res.status(409).json({ message: 'Tên loại phòng đã tồn tại.' });
    }

    const result = await pool.request()
      .input('name', sql.NVarChar(100), normalizedName)
      .input('description', sql.NVarChar(sql.MAX), description?.trim() || null)
      .input('base_price', sql.Decimal(12, 2), price)
      .input('max_adults', sql.TinyInt, adults)
      .input('max_children', sql.TinyInt, children)
      .query(`
        INSERT INTO room_types (name, description, base_price, max_adults, max_children)
        OUTPUT INSERTED.id, INSERTED.name, INSERTED.description, INSERTED.base_price,
               INSERTED.max_adults, INSERTED.max_children
        VALUES (@name, @description, @base_price, @max_adults, @max_children);
      `);

    return res.status(201).json({
      message: 'Thêm loại phòng thành công.',
      roomType: { ...result.recordset[0], base_price: Number(result.recordset[0].base_price) },
    });
  } catch (error) {
    if (error.number === 2601 || error.number === 2627) {
      return res.status(409).json({ message: 'Tên loại phòng đã tồn tại.' });
    }
    console.error('Create room type error:', error);
    return res.status(500).json({ message: 'Không thể thêm loại phòng.' });
  }
});
// Chỉ admin được cập nhật loại phòng (UC-04.4).
app.put('/api/room-types/:roomTypeId', async (req, res) => {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';

  if (!token) {
    return res.status(401).json({ message: 'Vui lòng đăng nhập để tiếp tục.' });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);
    if (user.role_code !== 'ADMIN') {
      return res.status(403).json({ message: 'Chỉ quản trị viên được cập nhật loại phòng.' });
    }
  } catch {
    return res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
  }

  const roomTypeId = Number(req.params.roomTypeId);
  if (!Number.isInteger(roomTypeId) || roomTypeId < 1) {
    return res.status(400).json({ message: 'Mã loại phòng không hợp lệ.' });
  }

  const { name, description, base_price, max_adults, max_children } = req.body || {};
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  const price = Number(base_price);
  const adults = Number(max_adults);
  const children = Number(max_children);

  if (!normalizedName || normalizedName.length > 100) {
    return res.status(400).json({ message: 'Tên loại phòng là bắt buộc và tối đa 100 ký tự.' });
  }
  if (!Number.isFinite(price) || price < 0 || !Number.isInteger(adults) || adults < 1 || adults > 255 || !Number.isInteger(children) || children < 0 || children > 255) {
    return res.status(400).json({ message: 'Giá và sức chứa không hợp lệ.' });
  }
  if (description != null && typeof description !== 'string') {
    return res.status(400).json({ message: 'Mô tả không hợp lệ.' });
  }

  try {
    const pool = await getPool();
    const existingType = await pool.request()
      .input('roomTypeId', sql.Int, roomTypeId)
      .input('name', sql.NVarChar(100), normalizedName)
      .query('SELECT TOP (1) id FROM room_types WHERE LOWER(LTRIM(RTRIM(name))) = LOWER(@name) AND id <> @roomTypeId;');
    if (existingType.recordset.length > 0) {
      return res.status(409).json({ message: 'Tên loại phòng đã được sử dụng.' });
    }

    const result = await pool.request()
      .input('roomTypeId', sql.Int, roomTypeId)
      .input('name', sql.NVarChar(100), normalizedName)
      .input('description', sql.NVarChar(sql.MAX), description?.trim() || null)
      .input('base_price', sql.Decimal(12, 2), price)
      .input('max_adults', sql.TinyInt, adults)
      .input('max_children', sql.TinyInt, children)
      .query(`
        UPDATE room_types
        SET name = @name,
            description = @description,
            base_price = @base_price,
            max_adults = @max_adults,
            max_children = @max_children
        OUTPUT INSERTED.id, INSERTED.name, INSERTED.description, INSERTED.base_price,
               INSERTED.max_adults, INSERTED.max_children
        WHERE id = @roomTypeId;
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ message: 'Không tìm thấy loại phòng.' });
    }
    return res.json({
      message: 'Cập nhật loại phòng thành công.',
      roomType: { ...result.recordset[0], base_price: Number(result.recordset[0].base_price) },
    });
  } catch (error) {
    console.error('Update room type error:', error);
    return res.status(500).json({ message: 'Không thể cập nhật loại phòng.' });
  }
});
// Chỉ admin được xóa loại phòng; không xóa loại còn phòng hoặc đánh giá liên quan.
app.delete('/api/room-types/:roomTypeId', async (req, res) => {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';

  if (!token) {
    return res.status(401).json({ message: 'Vui lòng đăng nhập để tiếp tục.' });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);
    if (user.role_code !== 'ADMIN') {
      return res.status(403).json({ message: 'Chỉ quản trị viên được xóa loại phòng.' });
    }
  } catch {
    return res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
  }

  const roomTypeId = Number(req.params.roomTypeId);
  if (!Number.isInteger(roomTypeId) || roomTypeId < 1) {
    return res.status(400).json({ message: 'Mã loại phòng không hợp lệ.' });
  }

  try {
    const pool = await getPool();
    const usage = await pool.request()
      .input('roomTypeId', sql.Int, roomTypeId)
      .query(`
        SELECT
          (SELECT COUNT(*) FROM rooms WHERE room_type_id = @roomTypeId) AS room_count,
          (SELECT COUNT(*) FROM reviews WHERE room_type_id = @roomTypeId) AS review_count,
          (SELECT name FROM room_types WHERE id = @roomTypeId) AS room_type_name;
      `);

    const roomType = usage.recordset[0];
    if (!roomType.room_type_name) {
      return res.status(404).json({ message: 'Không tìm thấy loại phòng.' });
    }
    if (Number(roomType.room_count) > 0 || Number(roomType.review_count) > 0) {
      const reasons = [];
      if (Number(roomType.room_count) > 0) reasons.push(`${roomType.room_count} phòng vật lý`);
      if (Number(roomType.review_count) > 0) reasons.push(`${roomType.review_count} đánh giá`);
      return res.status(409).json({
        message: `Không thể xóa “${roomType.room_type_name}” vì còn ${reasons.join(' và ')} liên quan.`,
      });
    }

    const result = await pool.request()
      .input('roomTypeId', sql.Int, roomTypeId)
      .query('DELETE FROM room_types OUTPUT DELETED.id WHERE id = @roomTypeId;');

    if (!result.recordset.length) {
      return res.status(404).json({ message: 'Không tìm thấy loại phòng.' });
    }
    return res.json({ message: `Đã xóa loại phòng “${roomType.room_type_name}”.` });
  } catch (error) {
    if (error.number === 547) {
      return res.status(409).json({ message: 'Không thể xóa loại phòng vì vẫn còn dữ liệu liên quan.' });
    }
    console.error('Delete room type error:', error);
    return res.status(500).json({ message: 'Không thể xóa loại phòng.' });
  }
});
// Lấy danh sách khuyến mãi đang active
app.get('/api/promotions/active', getPromotions);
// Lấy danh sách dịch vụ khách sạn
app.get('/api/services', getServices);
app.get('/api/services/:id', getActiveServiceById);
app.get('/api/admin/services', serviceController.requireAdmin, serviceController.getServices);
app.get('/api/admin/services/:id', serviceController.requireAdmin, serviceController.getServiceById);
app.post('/api/admin/services', serviceController.requireAdmin, serviceController.createService);
app.put('/api/admin/services/:id', serviceController.requireAdmin, serviceController.updateService);
app.delete('/api/admin/services/:id', serviceController.requireAdmin, serviceController.deleteService);
// Lấy đánh giá từ khách hàng
app.get('/api/reviews', getReviews);

// ============================================================================
// --- Chức năng: Check Room Availability & Đặt phòng tại quầy cho Lễ tân ---
// ============================================================================
// 1. Khách vãng lai (Guest), khách hàng (Customer) và Lễ tân (Receptionist) kiểm tra loại phòng còn trống theo ngày
app.get('/api/rooms/availability', checkAvailability);

// 2. Lấy danh sách số phòng vật lý còn trống theo từng loại phòng để lễ tân chọn tại quầy
app.get('/api/rooms/available-list', getAvailableRooms);

// 3. Lễ tân tạo đơn đặt phòng trực tiếp tại quầy (walk-in) cho khách
app.post('/api/bookings/walk-in', createWalkInBookingHandler);

// Khách hàng đã đăng nhập tạo booking online
app.post('/api/bookings/customer', createCustomerBookingHandler);
app.patch('/api/bookings/:bookingId', updateBookingHandler);
app.post('/api/bookings/:bookingId/cancel', cancelBookingHandler);
app.post('/api/bookings/:bookingId/check-in', checkInBookingHandler);
app.post('/api/bookings/:bookingId/check-out', checkOutBookingHandler);
app.get('/api/bookings/:bookingId/assignable-rooms', getAssignableRoomsHandler);
app.post('/api/bookings/:bookingId/assign-room', assignRoomHandler);
app.post('/api/rooms/:roomId/cleaning-complete', finishRoomCleaningHandler);
app.get('/api/rooms/statuses', getRoomStatusesHandler);

// 4. Lấy danh sách đặt phòng gần đây cho màn hình Dashboard Lễ tân
app.get('/api/bookings/recent', getRecentBookingsHandler);
app.get('/api/bookings/history', getBookingHistoryHandler);
app.get('/api/bookings/:bookingId/services', bookingServiceController.requireBookingServiceReadAccess, bookingServiceController.getBookingServiceData);
app.post('/api/bookings/:bookingId/services', bookingServiceController.requireBookingServiceWriteAccess, bookingServiceController.addBookingService);
app.get('/api/bookings/active', getActiveBookingsHandler);
app.post('/api/payments', requireCustomer, createPayment);
app.get('/api/payments', requirePaymentStaff, getPaymentList);
app.get('/api/payments/my', requireCustomer, getCustomerPaymentList);
app.get('/api/payments/:paymentCode/status', requirePaymentActor, getPaymentStatusRequest);
app.patch('/api/payments/:paymentCode/confirm', requirePaymentStaff, confirmPaymentRequest);
app.get('/api/payments/vnpay/return', handleVnpayReturn);
app.get('/api/payments/vnpay/ipn', handleVnpayIpn);


// Upload ảnh chính cho loại phòng
app.get('/api/room-types/:roomTypeId/image', async (req, res) => {
  const roomTypeId = Number(req.params.roomTypeId);
  if (!Number.isInteger(roomTypeId) || roomTypeId < 1) {
    return res.status(400).json({ message: 'Mã loại phòng không hợp lệ.' });
  }

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('roomTypeId', sql.Int, roomTypeId)
      .query(`
        SELECT TOP (1) image_url, image_data, mime_type
        FROM room_type_images
        WHERE room_type_id = @roomTypeId AND is_primary = 1
        ORDER BY id DESC;
      `);
    const image = result.recordset[0];
    if (!image) return res.status(404).json({ message: 'Loại phòng chưa có ảnh.' });

    if (image.image_data) {
      res.set('Content-Type', image.mime_type || 'application/octet-stream');
      res.set('Cache-Control', 'no-store');
      return res.send(image.image_data);
    }

    if (image.image_url && !image.image_url.includes('/api/room-types/')) {
      if (image.image_url.includes('/uploads/')) {
        const legacyFileName = path.basename(new URL(image.image_url).pathname);
        const legacyFilePath = path.resolve(uploadsDir, legacyFileName);
        if (legacyFilePath.startsWith(`${path.resolve(uploadsDir)}${path.sep}`) && fs.existsSync(legacyFilePath)) {
          return res.redirect(`/uploads/${encodeURIComponent(legacyFileName)}`);
        }
      }
      return res.redirect(image.image_url);
    }
    return res.status(404).json({ message: 'Không tìm thấy dữ liệu ảnh.' });
  } catch (error) {
    console.error('Read room image error:', error);
    return res.status(500).json({ message: 'Không thể tải ảnh loại phòng.' });
  }
});

app.post('/api/room-types/:roomTypeId/image', requireAdmin, upload.single('image'), async (req, res) => {
  let transaction;
  try {
    const { roomTypeId } = req.params;
    const imageFile = req.file;
    const parsedRoomTypeId = Number(roomTypeId);

    if (!imageFile) {
      return res.status(400).json({ message: 'Thiếu file ảnh.' });
    }
    if (!Number.isInteger(parsedRoomTypeId) || parsedRoomTypeId < 1) {
      return res.status(400).json({ message: 'Mã loại phòng không hợp lệ.' });
    }

    const pool = await getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const roomType = await new sql.Request(transaction)
      .input('roomTypeId', sql.Int, parsedRoomTypeId)
      .query('SELECT id FROM room_types WITH (UPDLOCK, HOLDLOCK) WHERE id = @roomTypeId;');
    if (!roomType.recordset.length) {
      await transaction.rollback();
      transaction = null;
      return res.status(404).json({ message: 'Không tìm thấy loại phòng.' });
    }

    const imageUrl = `${req.protocol}://${req.get('host')}/api/room-types/${parsedRoomTypeId}/image`;

    await new sql.Request(transaction)
      .input('roomTypeId', sql.Int, parsedRoomTypeId)
      .input('imageUrl', sql.VarChar(500), imageUrl)
      .input('imageData', sql.VarBinary(sql.MAX), imageFile.buffer)
      .input('mimeType', sql.VarChar(100), imageFile.mimetype)
      .query(`
        UPDATE room_type_images
        SET is_primary = 0
        WHERE room_type_id = @roomTypeId;

        INSERT INTO room_type_images (room_type_id, image_url, image_data, mime_type, is_primary)
        VALUES (@roomTypeId, @imageUrl, @imageData, @mimeType, 1);
      `);
    await transaction.commit();
    transaction = null;

    return res.status(201).json({
      message: 'Upload ảnh phòng thành công.',
      roomTypeId: parsedRoomTypeId,
      image_url: imageUrl,
    });
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (rollbackError) {
        console.error('Rollback room image upload failed:', rollbackError);
      }
    }
    console.error('Upload room image error:', error);
    return res.status(500).json({
      message: 'Upload ảnh thất bại.',
      error: error.message,
    });
  }
});

async function bootstrap() {
  await ensureAuthTables();
  const pool = await getPool();
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.services', N'U') IS NOT NULL
       AND COL_LENGTH('dbo.services', 'is_deleted') IS NULL
    BEGIN
      ALTER TABLE dbo.services
        ADD is_deleted BIT NOT NULL
          CONSTRAINT DF_services_is_deleted DEFAULT (0) WITH VALUES;
    END;
    IF COL_LENGTH('dbo.room_type_images', 'image_data') IS NULL
      ALTER TABLE dbo.room_type_images ADD image_data VARBINARY(MAX) NULL;
    IF COL_LENGTH('dbo.room_type_images', 'mime_type') IS NULL
      ALTER TABLE dbo.room_type_images ADD mime_type VARCHAR(100) NULL;
  `);
  const legacyImages = await pool.request().query(`
    SELECT id, room_type_id, image_url
    FROM dbo.room_type_images
    WHERE image_data IS NULL AND image_url LIKE '%/uploads/%';
  `);
  for (const image of legacyImages.recordset) {
    try {
      const fileName = path.basename(new URL(image.image_url).pathname);
      const filePath = path.resolve(uploadsDir, fileName);
      if (!filePath.startsWith(`${path.resolve(uploadsDir)}${path.sep}`) || !fs.existsSync(filePath)) continue;

      const extension = path.extname(fileName).toLowerCase();
      const mimeType = extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg';
      await pool.request()
        .input('imageId', sql.Int, image.id)
        .input('imageUrl', sql.VarChar(500), `http://localhost:${PORT}/api/room-types/${image.room_type_id}/image`)
        .input('imageData', sql.VarBinary(sql.MAX), fs.readFileSync(filePath))
        .input('mimeType', sql.VarChar(100), mimeType)
        .query(`
          UPDATE dbo.room_type_images
          SET image_url = @imageUrl, image_data = @imageData, mime_type = @mimeType
          WHERE id = @imageId AND image_data IS NULL;
        `);
    } catch (error) {
      console.error(`Could not migrate legacy room image row ${image.id}:`, error.message);
    }
  }
  if (legacyImages.recordset.length) {
    console.log(`Migrated ${legacyImages.recordset.length} legacy room image row(s) to SQL Server where source files were available.`);
  }

  let isExpirySweepRunning = false;
  const sweepExpiredBookings = async () => {
    if (isExpirySweepRunning) return;
    isExpirySweepRunning = true;
    try {
      const cancelledCount = await cancelExpiredBookings();
      if (cancelledCount > 0) console.log(`Auto-cancelled ${cancelledCount} booking(s) past the 18:00 check-in deadline.`);
    } catch (error) {
      console.error('Expired booking sweep failed:', error);
    } finally {
      isExpirySweepRunning = false;
    }
  };
  await sweepExpiredBookings();
  const expirySweepTimer = setInterval(() => void sweepExpiredBookings(), 30_000);
  expirySweepTimer.unref();
  app.listen(PORT, () => {
    console.log(`Hotel backend is running on http://localhost:${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error('Bootstrap failed:', error);
  process.exit(1);
});
