const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const { getPool, ensureAuthTables } = require('./config/db');
const { cancelExpiredBookings } = require('./dao/bookingDao');
// Seed data đã được tắt để dùng dữ liệu mẫu bạn insert trực tiếp trong SQL Server.
const { getHomeData, getRoomTypes, getPromotions, getServices, getReviews } = require('./controllers/homeController');
const { register, login, logout, verifyEmail } = require('./controllers/authController');
const { checkAvailability, getAvailableRooms } = require('./controllers/roomController');
const { createCustomerBookingHandler, checkInBookingHandler, createWalkInBookingHandler, getRecentBookingsHandler, getBookingHistoryHandler, updateBookingHandler, cancelBookingHandler, getActiveBookingsHandler, checkOutBookingHandler, finishRoomCleaningHandler, getRoomStatusesHandler, getAssignableRoomsHandler, assignRoomHandler } = require('./controllers/bookingController');

const app = express();
const PORT = 5000;
const uploadsDir = path.join(__dirname, '../uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '-');
    const timestamp = Date.now();
    cb(null, `${timestamp}-${safeName}`);
  },
});

const upload = multer({
  storage,
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

app.use(cors());
app.use(express.json());
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

// --- Frontend home data APIs ---
// Lấy dữ liệu tổng hợp cho trang chủ
app.get('/api/home', getHomeData);
// Lấy danh sách loại phòng để render UI
app.get('/api/room-types', getRoomTypes);
// Lấy danh sách khuyến mãi đang active
app.get('/api/promotions/active', getPromotions);
// Lấy danh sách dịch vụ khách sạn
app.get('/api/services', getServices);
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
app.get('/api/bookings/active', getActiveBookingsHandler);


// Upload ảnh chính cho loại phòng
app.post('/api/room-types/:roomTypeId/image', upload.single('image'), async (req, res) => {
  try {
    const { roomTypeId } = req.params;
    const imageFile = req.file;

    if (!imageFile) {
      return res.status(400).json({ message: 'Thiếu file ảnh.' });
    }

    const pool = await getPool();
    const imageUrl = `http://localhost:${PORT}/uploads/${imageFile.filename}`;

    await pool.request()
      .input('roomTypeId', sql.Int, Number(roomTypeId))
      .input('imageUrl', sql.VarChar(500), imageUrl)
      .query(`
        UPDATE room_type_images
        SET is_primary = 0
        WHERE room_type_id = @roomTypeId;

        INSERT INTO room_type_images (room_type_id, image_url, is_primary)
        VALUES (@roomTypeId, @imageUrl, 1);
      `);

    return res.status(201).json({
      message: 'Upload ảnh phòng thành công.',
      roomTypeId: Number(roomTypeId),
      image_url: imageUrl,
    });
  } catch (error) {
    console.error('Upload room image error:', error);
    return res.status(500).json({
      message: 'Upload ảnh thất bại.',
      error: error.message,
    });
  }
});

async function bootstrap() {
  await ensureAuthTables();
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
