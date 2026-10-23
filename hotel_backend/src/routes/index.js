const express = require('express');
const path = require('path');
const multer = require('multer');
const { getHomeData, getRoomTypes, getRoomTypeDetails, getPromotions, getServices, getActiveServiceById, getReviews } = require('../controllers/homeController');
const { register, login, logout, verifyEmail, forgotPassword, resetPassword, changePassword } = require('../controllers/authController');
const { getRoomList: getRoomListHandler, getRoomDetails: getRoomDetailsHandler, createRoom: createRoomHandler, updateRoom: updateRoomHandler, deleteRoom: deleteRoomHandler, checkAvailability, getAvailableRooms } = require('../controllers/roomController');
const { createCustomerBookingHandler, checkInBookingHandler, createWalkInBookingHandler, getRecentBookingsHandler, getBookingHistoryHandler, updateBookingHandler, cancelBookingHandler, getActiveBookingsHandler, checkOutBookingHandler, createReceptionInvoiceHandler, finishRoomCleaningHandler, reportRoomMaintenanceHandler, getRoomMaintenanceReportsHandler, resolveRoomMaintenanceReportHandler, getRoomStatusesHandler, getAssignableRoomsHandler, assignRoomHandler } = require('../controllers/bookingController');
const serviceController = require('../controllers/serviceController');
const { requireCustomer, requireReceptionist, requirePaymentStaff, requirePaymentActor, requireReviewStaff, requireProfileAccess, requireChangePassword } = require('../utils/middleware/customerAuth');
const { requireAdmin, requireRoomListAccess } = require('../utils/middleware/roleMiddleware');
const reviewController = require('../controllers/reviewController');
const { getProfile, updateProfile } = require('../controllers/profileController');
const { createPayment, getPaymentList, getCustomerPaymentList, getInvoiceList, getInvoiceDetail, getPaymentStatusRequest, confirmPaymentRequest, simulateDepositPaymentRequest } = require('../controllers/paymentController');
const { handleVnpayReturn, handleVnpayIpn } = require('../controllers/vnpayController');
const bookingServiceController = require('../controllers/bookingServiceController');
const { getAdminStatistics } = require('../controllers/statisticsController');
const promotionController = require('../controllers/promotionController');
const amenityController = require('../controllers/amenityController');
const roomTypeController = require('../controllers/roomTypeController');

const router = express.Router();
const vnpayEnabled = String(process.env.VNPAY_ENABLED || '').toLowerCase() === 'true';
const uploadsDir = path.join(__dirname, '../../uploads');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    return cb(new Error('Chỉ chấp nhận ảnh JPG, PNG, WEBP.'));
  },
});

router.get('/health', (req, res) => {
  res.json({ ok: true, message: 'Hotel backend is running' });
});

router.get('/admin/statistics', requireAdmin, getAdminStatistics);
router.get('/profile', requireProfileAccess, getProfile);
router.put('/profile', requireProfileAccess, updateProfile);

// --- Authentication APIs ---
// Đăng ký tài khoản mới cho khách hàng
router.post('/auth/register', register);
// Đăng nhập hệ thống bằng email và mật khẩu
router.post('/auth/login', login);
// Đăng xuất và revoke refresh token hiện tại
router.post('/auth/logout', logout);
// Xác thực email sau khi tài khoản mới được tạo
router.get('/auth/verify-email', verifyEmail);

// Quên mật khẩu
router.post('/auth/forgot-password', forgotPassword);
router.post('/auth/change-password', requireChangePassword, changePassword);

// Đặt lại mật khẩu bằng OTP
router.post('/auth/reset-password', resetPassword);
// --- Frontend home data APIs ---
// Lấy dữ liệu tổng hợp cho trang chủ
router.get('/home', getHomeData);
// Lấy danh sách loại phòng để render UI
router.get('/room-types', getRoomTypes);
router.get('/room-types/:roomTypeId', getRoomTypeDetails);
router.get('/admin/amenities', requireAdmin, amenityController.getAdminAmenities);

router.post('/room-types', requireAdmin, roomTypeController.createRoomType);
router.put('/room-types/:roomTypeId', requireAdmin, roomTypeController.updateRoomType);
router.delete('/room-types/:roomTypeId', requireAdmin, roomTypeController.deleteRoomType);
router.get('/promotions/active', getPromotions);
router.post('/promotions/validate', promotionController.validatePromotion);
router.get('/admin/promotions', requireAdmin, promotionController.getPromotions);
router.get('/admin/promotions/:id', requireAdmin, promotionController.getPromotionById);
router.post('/admin/promotions', requireAdmin, promotionController.createPromotion);
router.put('/admin/promotions/:id', requireAdmin, promotionController.updatePromotion);
router.delete('/admin/promotions/:id', requireAdmin, promotionController.deletePromotion);
// Lấy danh sách dịch vụ khách sạn
router.get('/services', getServices);
router.get('/services/:id', getActiveServiceById);
router.get('/admin/services', requireAdmin, serviceController.getServices);
router.get('/admin/services/:id', requireAdmin, serviceController.getServiceById);
router.post('/admin/services', requireAdmin, serviceController.createService);
router.put('/admin/services/:id', requireAdmin, serviceController.updateService);
router.delete('/admin/services/:id', requireAdmin, serviceController.deleteService);
// Lấy đánh giá từ khách hàng
router.get('/reviews/dashboard', requireReviewStaff, reviewController.getDashboardReviews);
router.get('/reviews/my-bookings', requireCustomer, reviewController.getCustomerBookings);
router.get('/reviews/mine/:reviewId', requireCustomer, reviewController.getMyReview);
router.post('/reviews', requireCustomer, reviewController.createReview);
router.put('/reviews/mine/:reviewId', requireCustomer, reviewController.updateReview);
router.delete('/reviews/mine/:reviewId', requireCustomer, reviewController.deleteMyReview);
router.delete('/reviews/:reviewId', requireAdmin, reviewController.deleteReview);
router.get('/reviews', getReviews);

// ============================================================================
// --- Chức năng: Check Room Availability & Đặt phòng tại quầy cho Lễ tân ---
// ============================================================================
// 1. Khách vãng lai (Guest), khách hàng (Customer) và Lễ tân (Receptionist) kiểm tra loại phòng còn trống theo ngày
router.get('/rooms/availability', checkAvailability);

// 2. Lấy danh sách số phòng vật lý còn trống theo từng loại phòng để lễ tân chọn tại quầy
router.get('/rooms/available-list', getAvailableRooms);

// 3. Lễ tân tạo đơn đặt phòng trực tiếp tại quầy (walk-in) cho khách
router.post('/bookings/walk-in', requireReceptionist, createWalkInBookingHandler);

// Khách hàng đã đăng nhập tạo booking online
router.post('/bookings/customer', createCustomerBookingHandler);
router.patch('/bookings/:bookingId', updateBookingHandler);
router.post('/bookings/:bookingId/cancel', cancelBookingHandler);
router.post('/bookings/:bookingId/check-in', checkInBookingHandler);
router.post('/bookings/:bookingId/check-out', checkOutBookingHandler);
router.post('/bookings/:bookingId/invoice', createReceptionInvoiceHandler);
router.get('/bookings/:bookingId/assignable-rooms', getAssignableRoomsHandler);
router.post('/bookings/:bookingId/assign-room', assignRoomHandler);
router.post('/rooms/:roomId/cleaning-complete', finishRoomCleaningHandler);
router.post('/rooms/:roomId/maintenance-report', reportRoomMaintenanceHandler);
router.get('/rooms/maintenance-reports', getRoomMaintenanceReportsHandler);
router.post('/rooms/maintenance-reports/:reportId/resolve', resolveRoomMaintenanceReportHandler);
router.get('/rooms/statuses', getRoomStatusesHandler);
router.get('/rooms', requireRoomListAccess, getRoomListHandler);
router.post('/rooms', requireAdmin, createRoomHandler);
router.get('/rooms/:roomId', requireRoomListAccess, getRoomDetailsHandler);
router.put('/rooms/:roomId', requireAdmin, updateRoomHandler);
router.delete('/rooms/:roomId', requireAdmin, deleteRoomHandler);

// 4. Lấy danh sách đặt phòng gần đây cho màn hình Dashboard Lễ tân
router.get('/bookings/recent', getRecentBookingsHandler);
router.get('/bookings/history', getBookingHistoryHandler);
router.get('/bookings/:bookingId/services', bookingServiceController.requireBookingServiceReadAccess, bookingServiceController.getBookingServiceData);
router.post('/bookings/:bookingId/services', bookingServiceController.requireBookingServiceWriteAccess, bookingServiceController.addBookingService);
router.get('/bookings/active', getActiveBookingsHandler);
router.post('/payments', requireCustomer, createPayment);
router.get('/payments', requirePaymentStaff, getPaymentList);
router.get('/payments/my', requireCustomer, getCustomerPaymentList);
router.get('/invoices', requirePaymentStaff, getInvoiceList);
router.get('/invoices/my', requireCustomer, getInvoiceList);
router.get('/invoices/:invoiceId', requirePaymentStaff, getInvoiceDetail);
router.get('/invoices/my/:invoiceId', requireCustomer, getInvoiceDetail);
router.get('/payments/:paymentCode/status', requirePaymentActor, getPaymentStatusRequest);
router.patch('/payments/:paymentCode/confirm', requirePaymentStaff, confirmPaymentRequest);
router.post('/payments/:paymentCode/simulate', requireCustomer, simulateDepositPaymentRequest);
if (vnpayEnabled) {
  router.get('/payments/vnpay/return', handleVnpayReturn);
  router.get('/payments/vnpay/ipn', handleVnpayIpn);
}


// Upload ảnh chính cho loại phòng
router.get('/room-types/:roomTypeId/image', roomTypeController.getRoomTypeImage);

router.post('/room-types/:roomTypeId/image', requireAdmin, upload.single('image'), roomTypeController.uploadRoomTypeImage);

module.exports = router;
