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
const jwt = require('jsonwebtoken');
const { ensureAuthTables, ensureBookingStatusConstraint, ensureGuestIdCardOptional, ensureInvoiceCreatorColumn, ensureBookingPromotionColumns, ensureBookingCancellationReason, ensureReviewBookingColumn } = require('./config/db');
// Seed data đã được tắt để dùng dữ liệu mẫu bạn insert trực tiếp trong SQL Server.
const { getHomeData, getRoomTypes, getRoomTypeDetails, getPromotions, getServices, getActiveServiceById, getReviews } = require('./controllers/homeController');
const { register, login, logout, verifyEmail, forgotPassword, resetPassword, changePassword } = require('./controllers/authController');
const { getRoomList: getRoomListHandler, getRoomDetails: getRoomDetailsHandler, createRoom: createRoomHandler, updateRoom: updateRoomHandler, deleteRoom: deleteRoomHandler, checkAvailability, getAvailableRooms } = require('./controllers/roomController');
const { createCustomerBookingHandler, checkInBookingHandler, createWalkInBookingHandler, getRecentBookingsHandler, getBookingHistoryHandler, updateBookingHandler, cancelBookingHandler, getActiveBookingsHandler, checkOutBookingHandler, createReceptionInvoiceHandler, finishRoomCleaningHandler, reportRoomMaintenanceHandler, getRoomMaintenanceReportsHandler, resolveRoomMaintenanceReportHandler, getRoomStatusesHandler, getAssignableRoomsHandler, assignRoomHandler } = require('./controllers/bookingController');
const serviceController = require('./controllers/serviceController');
const { requireCustomer, requirePaymentStaff, requirePaymentActor, requireReviewStaff, requireProfileAccess, requireChangePassword } = require('./services/customerAuth');
const reviewController = require('./controllers/reviewController');
const { getProfile, updateProfile } = require('./controllers/profileController');
const { createPayment, getPaymentList, getCustomerPaymentList, getInvoiceList, getInvoiceDetail, getPaymentStatusRequest, confirmPaymentRequest, simulateDepositPaymentRequest } = require('./controllers/paymentController');
const { handleVnpayReturn, handleVnpayIpn } = require('./controllers/vnpayController');
const bookingServiceController = require('./controllers/bookingServiceController');
const { getAdminStatistics } = require('./controllers/statisticsController');
const bookingService = require('./services/bookingService');
const { prepareRuntimeDatabase } = require('./services/startupService');
const promotionController = require('./controllers/promotionController');
const amenityController = require('./controllers/amenityController');
const roomTypeController = require('./controllers/roomTypeController');
const app = express();
const PORT = 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'hotel-management-secret';
const vnpayEnabled = String(process.env.VNPAY_ENABLED || '').toLowerCase() === 'true';
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

function requireRoomListAccess(req, res, next) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập để tiếp tục.' });
  try {
    const user = jwt.verify(token, JWT_SECRET);
    const roleById = { 1: 'CUSTOMER', 2: 'RECEPTIONIST', 3: 'HOUSEKEEPER', 4: 'ADMIN' };
    const roleCode = String(user.role_code || roleById[Number(user.role_id)] || '').toUpperCase();
    if (!['ADMIN', 'RECEPTIONIST'].includes(roleCode)) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xem thông tin phòng.' });
    }
    return next();
  } catch {
    return res.status(401).json({ success: false, message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
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

app.get('/api/admin/statistics', requireAdmin, getAdminStatistics);
app.get('/api/profile', requireProfileAccess, getProfile);
app.put('/api/profile', requireProfileAccess, updateProfile);

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
app.post('/api/auth/change-password', requireChangePassword, changePassword);

// Đặt lại mật khẩu bằng OTP
app.post('/api/auth/reset-password', resetPassword);
// --- Frontend home data APIs ---
// Lấy dữ liệu tổng hợp cho trang chủ
app.get('/api/home', getHomeData);
// Lấy danh sách loại phòng để render UI
app.get('/api/room-types', getRoomTypes);
app.get('/api/room-types/:roomTypeId', getRoomTypeDetails);
app.get('/api/admin/amenities', requireAdmin, amenityController.getAdminAmenities);

app.post('/api/room-types', roomTypeController.createRoomType);
app.put('/api/room-types/:roomTypeId', roomTypeController.updateRoomType);
app.delete('/api/room-types/:roomTypeId', roomTypeController.deleteRoomType);
app.get('/api/promotions/active', getPromotions);
app.post('/api/promotions/validate', promotionController.validatePromotion);
app.get('/api/admin/promotions', promotionController.requireAdmin, promotionController.getPromotions);
app.get('/api/admin/promotions/:id', promotionController.requireAdmin, promotionController.getPromotionById);
app.post('/api/admin/promotions', promotionController.requireAdmin, promotionController.createPromotion);
app.put('/api/admin/promotions/:id', promotionController.requireAdmin, promotionController.updatePromotion);
app.delete('/api/admin/promotions/:id', promotionController.requireAdmin, promotionController.deletePromotion);
// Lấy danh sách dịch vụ khách sạn
app.get('/api/services', getServices);
app.get('/api/services/:id', getActiveServiceById);
app.get('/api/admin/services', serviceController.requireAdmin, serviceController.getServices);
app.get('/api/admin/services/:id', serviceController.requireAdmin, serviceController.getServiceById);
app.post('/api/admin/services', serviceController.requireAdmin, serviceController.createService);
app.put('/api/admin/services/:id', serviceController.requireAdmin, serviceController.updateService);
app.delete('/api/admin/services/:id', serviceController.requireAdmin, serviceController.deleteService);
// Lấy đánh giá từ khách hàng
app.get('/api/reviews/dashboard', requireReviewStaff, reviewController.getDashboardReviews);
app.get('/api/reviews/my-bookings', requireCustomer, reviewController.getCustomerBookings);
app.get('/api/reviews/mine/:reviewId', requireCustomer, reviewController.getMyReview);
app.post('/api/reviews', requireCustomer, reviewController.createReview);
app.put('/api/reviews/mine/:reviewId', requireCustomer, reviewController.updateReview);
app.delete('/api/reviews/mine/:reviewId', requireCustomer, reviewController.deleteMyReview);
app.delete('/api/reviews/:reviewId', requireAdmin, reviewController.deleteReview);
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
app.post('/api/bookings/:bookingId/invoice', createReceptionInvoiceHandler);
app.get('/api/bookings/:bookingId/assignable-rooms', getAssignableRoomsHandler);
app.post('/api/bookings/:bookingId/assign-room', assignRoomHandler);
app.post('/api/rooms/:roomId/cleaning-complete', finishRoomCleaningHandler);
app.post('/api/rooms/:roomId/maintenance-report', reportRoomMaintenanceHandler);
app.get('/api/rooms/maintenance-reports', getRoomMaintenanceReportsHandler);
app.post('/api/rooms/maintenance-reports/:reportId/resolve', resolveRoomMaintenanceReportHandler);
app.get('/api/rooms/statuses', getRoomStatusesHandler);
app.get('/api/rooms', requireRoomListAccess, getRoomListHandler);
app.post('/api/rooms', requireAdmin, createRoomHandler);
app.get('/api/rooms/:roomId', requireRoomListAccess, getRoomDetailsHandler);
app.put('/api/rooms/:roomId', requireAdmin, updateRoomHandler);
app.delete('/api/rooms/:roomId', requireAdmin, deleteRoomHandler);

// 4. Lấy danh sách đặt phòng gần đây cho màn hình Dashboard Lễ tân
app.get('/api/bookings/recent', getRecentBookingsHandler);
app.get('/api/bookings/history', getBookingHistoryHandler);
app.get('/api/bookings/:bookingId/services', bookingServiceController.requireBookingServiceReadAccess, bookingServiceController.getBookingServiceData);
app.post('/api/bookings/:bookingId/services', bookingServiceController.requireBookingServiceWriteAccess, bookingServiceController.addBookingService);
app.get('/api/bookings/active', getActiveBookingsHandler);
app.post('/api/payments', requireCustomer, createPayment);
app.get('/api/payments', requirePaymentStaff, getPaymentList);
app.get('/api/payments/my', requireCustomer, getCustomerPaymentList);
app.get('/api/invoices', requirePaymentStaff, getInvoiceList);
app.get('/api/invoices/my', requireCustomer, getInvoiceList);
app.get('/api/invoices/:invoiceId', requirePaymentStaff, getInvoiceDetail);
app.get('/api/invoices/my/:invoiceId', requireCustomer, getInvoiceDetail);
app.get('/api/payments/:paymentCode/status', requirePaymentActor, getPaymentStatusRequest);
app.patch('/api/payments/:paymentCode/confirm', requirePaymentStaff, confirmPaymentRequest);
app.post('/api/payments/:paymentCode/simulate', requireCustomer, simulateDepositPaymentRequest);
if (vnpayEnabled) {
  app.get('/api/payments/vnpay/return', handleVnpayReturn);
  app.get('/api/payments/vnpay/ipn', handleVnpayIpn);
}


// Upload ảnh chính cho loại phòng
app.get('/api/room-types/:roomTypeId/image', roomTypeController.getRoomTypeImage);

app.post('/api/room-types/:roomTypeId/image', requireAdmin, upload.single('image'), roomTypeController.uploadRoomTypeImage);

async function bootstrap() {
  await ensureAuthTables();
  await ensureBookingStatusConstraint();
  await ensureGuestIdCardOptional();
  await ensureInvoiceCreatorColumn();
  await ensureBookingPromotionColumns();
  await ensureBookingCancellationReason();
  await ensureReviewBookingColumn();
  await bookingService.expirePendingBookings();
  await prepareRuntimeDatabase(uploadsDir, PORT);

  app.listen(PORT, () => {
    console.log(`Hotel backend is running on http://localhost:${PORT}`);
  });
  const pendingBookingExpiryTimer = setInterval(() => {
    bookingService.expirePendingBookings().catch((error) => console.error('Pending booking expiry failed:', error.message));
  }, 60_000);
  pendingBookingExpiryTimer.unref?.();
}

bootstrap().catch((error) => {
  console.error('Bootstrap failed:', error);
  process.exit(1);
});
