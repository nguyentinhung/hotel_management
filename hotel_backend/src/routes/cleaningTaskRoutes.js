const express = require('express');
const cleaningTaskController = require('../controllers/cleaningTaskController');
const {
  requireCleaningTaskRead,
  requireCleaningTaskManagement,
  requireHousekeeper,
  requireReceptionist,
} = require('../middlewares/customerAuth');

const router = express.Router();

router.get('/cleaning-tasks/housekeepers', requireCleaningTaskManagement, cleaningTaskController.listAssignableHousekeepers);
router.get('/cleaning-tasks/checkout-bookings/:bookingId/rooms', requireReceptionist, cleaningTaskController.listCheckoutRoomAssignments);
router.post('/cleaning-tasks/checkout-bookings/:bookingId/rooms/:bookingRoomId/assign', requireReceptionist, cleaningTaskController.assignCheckoutRoomTask);
router.get('/cleaning-tasks', requireCleaningTaskRead, cleaningTaskController.listTasks);
router.get('/cleaning-tasks/:taskId/inspection-equipment', requireHousekeeper, cleaningTaskController.listInspectionEquipment);
router.post('/cleaning-tasks/:taskId/inspection', requireHousekeeper, cleaningTaskController.submitEquipmentInspection);
router.put('/cleaning-tasks/:taskId/inspection-items/:inspectionItemId/compensation', requireReceptionist, cleaningTaskController.saveInspectionItemCompensation);
router.post('/cleaning-tasks/stayover-bulk', requireCleaningTaskManagement, cleaningTaskController.createStayoverTasksForToday);
router.post('/cleaning-tasks', requireCleaningTaskManagement, cleaningTaskController.createTask);
router.get('/cleaning-tasks/:taskId', requireCleaningTaskRead, cleaningTaskController.getTask);
router.post('/cleaning-tasks/:taskId/assign', requireCleaningTaskManagement, cleaningTaskController.assignTask);
router.post('/cleaning-tasks/:taskId/start', requireHousekeeper, cleaningTaskController.startTask);
router.post('/cleaning-tasks/:taskId/complete', requireHousekeeper, cleaningTaskController.completeTask);
router.post('/cleaning-tasks/:taskId/skip', requireHousekeeper, cleaningTaskController.skipTask);

module.exports = router;
