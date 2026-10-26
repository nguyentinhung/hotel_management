const express = require('express');
const bookingController = require('../controllers/bookingController');
const bookingServiceController = require('../controllers/bookingServiceController');
const { requireBookingServiceReadAccess, requireBookingServiceWriteAccess } = require('../middlewares/bookingServiceAccess');
const { requireReceptionist, requireBookingReadAccess } = require('../middlewares/customerAuth');
const { uploadIdCardImage } = require('../middlewares/upload');

const router = express.Router();
router.post('/bookings/walk-in', requireReceptionist, uploadIdCardImage, bookingController.createWalkInBookingHandler);
router.post('/bookings/customer', bookingController.createCustomerBookingHandler);
router.patch('/bookings/:bookingId', bookingController.updateBookingHandler);
router.post('/bookings/:bookingId/cancel', bookingController.cancelBookingHandler);
router.post('/bookings/:bookingId/check-in', requireReceptionist, uploadIdCardImage, bookingController.checkInBookingHandler);
router.post('/bookings/:bookingId/check-out', bookingController.checkOutBookingHandler);
router.post('/bookings/:bookingId/invoice', bookingController.createReceptionInvoiceHandler);
router.get('/bookings/:bookingId/assignable-rooms', bookingController.getAssignableRoomsHandler);
router.post('/bookings/:bookingId/assign-room', bookingController.assignRoomHandler);
router.get('/bookings/recent', bookingController.getRecentBookingsHandler);
router.get('/bookings/history', bookingController.getBookingHistoryHandler);
router.get('/bookings/:bookingId/services', requireBookingServiceReadAccess, bookingServiceController.getBookingServiceData);
router.post('/bookings/:bookingId/services', requireBookingServiceWriteAccess, bookingServiceController.addBookingService);
router.get('/bookings/active', bookingController.getActiveBookingsHandler);
router.get('/bookings/:bookingId', requireBookingReadAccess, bookingController.getBookingDetailsHandler);

module.exports = router;
