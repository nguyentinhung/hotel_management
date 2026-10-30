const cleaningTaskService = require('../services/cleaningTaskService');

function respondWithError(res, error, context) {
  if ([400, 403, 404, 409].includes(error.statusCode)) {
    return res.status(error.statusCode).json({ success: false, message: error.message, ...(error.reason ? { reason: error.reason } : {}) });
  }
  console.error(`${context} failed:`, error);
  return res.status(500).json({ success: false, message: 'Unable to process the cleaning task request.' });
}

async function listTasks(req, res) {
  try {
    const tasks = await cleaningTaskService.listTasks(req.query, req.auth);
    return res.json({ success: true, count: tasks.length, tasks });
  } catch (error) {
    return respondWithError(res, error, 'List cleaning tasks');
  }
}

async function getTask(req, res) {
  try {
    const task = await cleaningTaskService.getTask(req.params.taskId, req.auth);
    if (!task) return res.status(404).json({ success: false, message: 'Cleaning task not found.' });
    return res.json({ success: true, task });
  } catch (error) {
    return respondWithError(res, error, 'Get cleaning task');
  }
}

async function listInspectionEquipment(req, res) {
  try {
    const equipment = await cleaningTaskService.listInspectionEquipment(req.params.taskId, req.auth.userId);
    return res.json({ success: true, count: equipment.length, equipment });
  } catch (error) {
    return respondWithError(res, error, 'List checkout inspection equipment');
  }
}

async function submitEquipmentInspection(req, res) {
  try {
    const result = await cleaningTaskService.submitEquipmentInspection(
      req.params.taskId,
      req.body?.inspections,
      req.auth.userId,
    );
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    return respondWithError(res, error, 'Submit checkout equipment inspection');
  }
}

async function saveInspectionItemCompensation(req, res) {
  try {
    const compensation = await cleaningTaskService.saveInspectionItemCompensation(
      req.params.taskId,
      req.params.inspectionItemId,
      req.body || {},
      req.auth.userId,
    );
    return res.json({ success: true, compensation });
  } catch (error) {
    return respondWithError(res, error, 'Save equipment compensation decision');
  }
}

async function listAssignableHousekeepers(req, res) {
  try {
    const housekeepers = await cleaningTaskService.listAssignableHousekeepers();
    return res.json({ success: true, count: housekeepers.length, housekeepers });
  } catch (error) {
    return respondWithError(res, error, 'List assignable housekeepers');
  }
}

async function listCheckoutRoomAssignments(req, res) {
  try {
    const rooms = await cleaningTaskService.listCheckoutRoomAssignments(req.params.bookingId);
    return res.json({ success: true, count: rooms.length, rooms });
  } catch (error) {
    return respondWithError(res, error, 'List checkout cleaning assignments');
  }
}

async function assignCheckoutRoomTask(req, res) {
  try {
    const result = await cleaningTaskService.assignCheckoutRoomTask({
      ...req.body,
      booking_id: req.params.bookingId,
      booking_room_id: req.params.bookingRoomId,
    }, req.auth.userId);
    return res.status(result.created ? 201 : 200).json({
      success: true,
      created: result.created,
      already_assigned: result.already_assigned,
      task: result.task,
    });
  } catch (error) {
    return respondWithError(res, error, 'Assign checkout cleaning task');
  }
}

async function createTask(req, res) {
  try {
    const result = await cleaningTaskService.createTask(req.body || {}, req.auth.userId);
    return res.status(result.replayed ? 200 : 201).json({
      success: true,
      replayed: result.replayed,
      task: result.task,
    });
  } catch (error) {
    return respondWithError(res, error, 'Create cleaning task');
  }
}

async function createStayoverTasksForToday(req, res) {
  try {
    const result = await cleaningTaskService.createStayoverTasksForToday(req.auth.userId);
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    return respondWithError(res, error, 'Bulk create stayover cleaning tasks');
  }
}

async function assignTask(req, res) {
  try {
    const task = await cleaningTaskService.assignTask(req.params.taskId, req.body?.assigned_to, req.auth.userId);
    return res.json({ success: true, task });
  } catch (error) {
    return respondWithError(res, error, 'Assign cleaning task');
  }
}

async function startTask(req, res) {
  try {
    const task = await cleaningTaskService.startTask(req.params.taskId, req.auth.userId);
    return res.json({ success: true, task });
  } catch (error) {
    return respondWithError(res, error, 'Start cleaning task');
  }
}

async function completeTask(req, res) {
  try {
    const task = await cleaningTaskService.completeTask(req.params.taskId, req.auth.userId);
    return res.json({ success: true, task });
  } catch (error) {
    return respondWithError(res, error, 'Complete cleaning task');
  }
}

async function skipTask(req, res) {
  try {
    const task = await cleaningTaskService.skipTask(req.params.taskId, req.body?.skip_reason, req.auth.userId);
    return res.json({ success: true, task });
  } catch (error) {
    return respondWithError(res, error, 'Skip cleaning task');
  }
}

module.exports = {
  listTasks,
  getTask,
  listInspectionEquipment,
  submitEquipmentInspection,
  saveInspectionItemCompensation,
  listAssignableHousekeepers,
  listCheckoutRoomAssignments,
  assignCheckoutRoomTask,
  createTask,
  createStayoverTasksForToday,
  assignTask,
  startTask,
  completeTask,
  skipTask,
};
