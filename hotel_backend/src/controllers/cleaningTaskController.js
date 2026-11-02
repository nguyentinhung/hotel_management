const cleaningTaskService = require('../services/cleaningTaskService');
const { toTaskListResponse } = require('../dto/housekeeping/view-task-list/task-list-response.dto');
const { toTaskDetailsResponse } = require('../dto/housekeeping/view-task-details/task-details-response.dto');
const { toSubmitInspectionRequest } = require('../dto/housekeeping/submit-inspection/submit-inspection-request.dto');
const { toAssignCleaningTaskRequest } = require('../dto/housekeeping/assign-task/assign-task-request.dto');
const { toSkipCleaningTaskRequest } = require('../dto/housekeeping/skip-task/skip-task-request.dto');
const { toSaveInspectionCompensationRequest } = require('../dto/housekeeping/save-inspection-compensation/save-inspection-compensation-request.dto');
const { toCreateCleaningTaskRequest } = require('../dto/housekeeping/create-task/create-task-request.dto');
const { toAssignCheckoutCleaningTaskRequest } = require('../dto/housekeeping/assign-checkout-cleaning-task/assign-checkout-cleaning-task-request.dto');
const { toListInspectionEquipmentResponse } = require('../dto/housekeeping/list-inspection-equipment/list-inspection-equipment-response.dto');
const { toSubmitInspectionResponse } = require('../dto/housekeeping/submit-inspection/submit-inspection-response.dto');
const { toAssignCleaningTaskResponse } = require('../dto/housekeeping/assign-task/assign-task-response.dto');
const { toStartCleaningTaskResponse } = require('../dto/housekeeping/start-task/start-task-response.dto');
const { toCompleteCleaningTaskResponse } = require('../dto/housekeeping/complete-task/complete-task-response.dto');
const { toSkipCleaningTaskResponse } = require('../dto/housekeeping/skip-task/skip-task-response.dto');
const { toSaveInspectionCompensationResponse } = require('../dto/housekeeping/save-inspection-compensation/save-inspection-compensation-response.dto');
const { toCreateCleaningTaskResponse } = require('../dto/housekeeping/create-task/create-task-response.dto');
const { toAssignCheckoutCleaningTaskResponse } = require('../dto/housekeeping/assign-checkout-cleaning-task/assign-checkout-cleaning-task-response.dto');

function respondWithError(res, error, context) {
  if ([400, 403, 404, 409].includes(error.statusCode)) {
    return res.status(error.statusCode).json({ success: false, message: error.message, ...(error.reason ? { reason: error.reason } : {}) });
  }
  if (Number(error.number) === 515 && /cleaning_tasks.*assigned_to/i.test(String(error.message || ''))) {
    console.error(`${context} failed because the database still requires a housekeeper assignment:`, error);
    return res.status(500).json({
      success: false,
      message: 'Database schema is outdated. Run 20261101_allow_unassigned_cleaning_tasks.sql so pending tasks can be created without a housekeeper.',
    });
  }
  console.error(`${context} failed:`, error);
  return res.status(500).json({ success: false, message: 'Unable to process the cleaning task request.' });
}

async function listTasks(req, res) {
  try {
    const tasks = await cleaningTaskService.listTasks(req.query, req.auth);
    return res.json(toTaskListResponse(tasks));
  } catch (error) {
    return respondWithError(res, error, 'List cleaning tasks');
  }
}

async function getTask(req, res) {
  try {
    const task = await cleaningTaskService.getTask(req.params.taskId, req.auth);
    if (!task) return res.status(404).json({ success: false, message: 'Cleaning task not found.' });
    return res.json(toTaskDetailsResponse(task));
  } catch (error) {
    return respondWithError(res, error, 'Get cleaning task');
  }
}

async function listInspectionEquipment(req, res) {
  try {
    const equipment = await cleaningTaskService.listInspectionEquipment(req.params.taskId, req.auth.userId);
    return res.json(toListInspectionEquipmentResponse(equipment));
  } catch (error) {
    return respondWithError(res, error, 'List checkout inspection equipment');
  }
}

async function submitEquipmentInspection(req, res) {
  try {
    const result = await cleaningTaskService.submitEquipmentInspection(
      req.params.taskId,
      toSubmitInspectionRequest(req.body).inspections,
      req.auth.userId,
    );
    return res.status(201).json(toSubmitInspectionResponse(result));
  } catch (error) {
    return respondWithError(res, error, 'Submit checkout equipment inspection');
  }
}

async function saveInspectionItemCompensation(req, res) {
  try {
    const compensation = await cleaningTaskService.saveInspectionItemCompensation(
      req.params.taskId,
      req.params.inspectionItemId,
      toSaveInspectionCompensationRequest(req.body),
      req.auth.userId,
    );
    return res.json(toSaveInspectionCompensationResponse(compensation));
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
      ...toAssignCheckoutCleaningTaskRequest(req.body, req.params.bookingId, req.params.bookingRoomId),
    }, req.auth.userId);
    return res.status(result.created ? 201 : 200).json(toAssignCheckoutCleaningTaskResponse(result));
  } catch (error) {
    return respondWithError(res, error, 'Assign checkout cleaning task');
  }
}

async function createTask(req, res) {
  try {
    const result = await cleaningTaskService.createTask(toCreateCleaningTaskRequest(req.body), req.auth.userId);
    return res.status(result.replayed ? 200 : 201).json(toCreateCleaningTaskResponse(result));
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
    const { assigned_to: assignedTo } = toAssignCleaningTaskRequest(req.body);
    const task = await cleaningTaskService.assignTask(req.params.taskId, assignedTo, req.auth.userId);
    return res.json(toAssignCleaningTaskResponse(task));
  } catch (error) {
    return respondWithError(res, error, 'Assign cleaning task');
  }
}

async function startTask(req, res) {
  try {
    const task = await cleaningTaskService.startTask(req.params.taskId, req.auth.userId);
    return res.json(toStartCleaningTaskResponse(task));
  } catch (error) {
    return respondWithError(res, error, 'Start cleaning task');
  }
}

async function completeTask(req, res) {
  try {
    const task = await cleaningTaskService.completeTask(req.params.taskId, req.auth.userId);
    return res.json(toCompleteCleaningTaskResponse(task));
  } catch (error) {
    return respondWithError(res, error, 'Complete cleaning task');
  }
}

async function skipTask(req, res) {
  try {
    const { skip_reason: skipReason } = toSkipCleaningTaskRequest(req.body);
    const task = await cleaningTaskService.skipTask(req.params.taskId, skipReason, req.auth.userId);
    return res.json(toSkipCleaningTaskResponse(task));
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
