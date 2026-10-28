const express = require('express');
const roomController = require('../controllers/roomController');
const bookingController = require('../controllers/bookingController');
const { requireAdmin, requireRoomListAccess } = require('../middlewares/roleMiddleware');

const router = express.Router();
router.get('/rooms/availability', roomController.checkAvailability);
router.get('/rooms/available-list', roomController.getAvailableRooms);
router.post('/rooms/:roomId/cleaning-complete', bookingController.finishRoomCleaningHandler);
router.put('/rooms/:roomId/status', bookingController.updateRoomStatusHandler);
router.post('/rooms/:roomId/maintenance-report', bookingController.reportRoomMaintenanceHandler);
router.get('/rooms/maintenance-reports', bookingController.getRoomMaintenanceReportsHandler);
router.post('/rooms/maintenance-reports/:reportId/resolve', bookingController.resolveRoomMaintenanceReportHandler);
router.get('/rooms/statuses', bookingController.getRoomStatusesHandler);
router.get('/rooms', requireRoomListAccess, roomController.getRoomList);
router.post('/rooms', requireAdmin, roomController.createRoom);
router.get('/rooms/:roomId', requireRoomListAccess, roomController.getRoomDetails);
router.put('/rooms/:roomId', requireAdmin, roomController.updateRoom);
router.delete('/rooms/:roomId', requireAdmin, roomController.deleteRoom);

module.exports = router;
