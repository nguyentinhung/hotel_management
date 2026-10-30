const cleaningTaskDao = require('../dao/cleaningTaskDao');
const cleaningTaskInspectionDao = require('../dao/cleaningTaskInspectionDao');
const cleaningTaskCompensationDao = require('../dao/cleaningTaskCompensationDao');
const CleaningTaskModel = require('../models/cleaningTaskModel');

function requireReason(value, field) {
  const reason = CleaningTaskModel.normalizeText(value, field, 500);
  if (!reason || !reason.replace(/[ \t\n\v\f\r\u00a0]/g, '')) {
    throw Object.assign(new Error(`${field} is required and cannot contain only whitespace.`), { statusCode: 400 });
  }
  return reason;
}

function normalizeCompensationDecision(decision, rawAmount) {
  if (decision !== 'COMPENSATION' && decision !== 'NO_COMPENSATION') {
    throw Object.assign(new Error('decision must be COMPENSATION or NO_COMPENSATION.'), { statusCode: 400 });
  }
  if (decision === 'NO_COMPENSATION') return { decision, amount: 0 };

  if (typeof rawAmount !== 'number' || !Number.isFinite(rawAmount) || rawAmount <= 0) {
    throw Object.assign(new Error('amount must be a positive finite number.'), { statusCode: 400 });
  }
  const decimalText = String(rawAmount);
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(decimalText);
  if (!match || Number(match[1]) > 999999999999
    || (Number(match[1]) === 999999999999 && Number(match[2] || '0') > 99)) {
    throw Object.assign(new Error('amount must fit DECIMAL(14,2) and have at most two decimal places.'), { statusCode: 400 });
  }
  return { decision, amount: rawAmount };
}

async function createTask(input, creatorUserId) {
  const normalized = CleaningTaskModel.normalizeCreateInput(input);
  if (normalized.task_type !== 'ON_DEMAND_CLEANING' && normalized.booking_room_id == null) {
    throw Object.assign(new Error('booking_room_id is required for checkout and stayover cleaning.'), { statusCode: 400 });
  }
  const parsedCreatorUserId = CleaningTaskModel.parseBigIntId(creatorUserId, 'Authenticated user ID');
  const hash = CleaningTaskModel.hashCreatePayload(normalized, parsedCreatorUserId);
  return cleaningTaskDao.createTask(normalized, {
    creatorUserId: parsedCreatorUserId,
    requestHash: hash,
  });
}

async function createStayoverTasksForToday(creatorUserId) {
  const parsedCreatorUserId = CleaningTaskModel.parseBigIntId(creatorUserId, 'Authenticated user ID');
  return cleaningTaskDao.createStayoverTasksForToday(parsedCreatorUserId);
}

async function listTasks(query, auth) {
  const filters = CleaningTaskModel.normalizeListFilters(query);
  const assignedTo = auth.roleCode === 'HOUSEKEEPER'
    ? CleaningTaskModel.parseBigIntId(auth.userId, 'Authenticated user ID')
    : null;
  return cleaningTaskDao.listTasks(filters, { assignedTo });
}

async function getTask(taskId, auth) {
  const parsedTaskId = CleaningTaskModel.parseBigIntId(taskId, 'Task ID');
  const assignedTo = auth.roleCode === 'HOUSEKEEPER'
    ? CleaningTaskModel.parseBigIntId(auth.userId, 'Authenticated user ID')
    : null;
  const task = await cleaningTaskDao.getTask(parsedTaskId, { assignedTo });
  if (!task) return null;
  if (task.task_type === 'CHECKOUT_CLEANING') {
    task.inspection_report = await cleaningTaskInspectionDao.getInspectionReport(parsedTaskId);
  }
  return task;
}

async function listInspectionEquipment(taskId, actorUserId) {
  return cleaningTaskInspectionDao.listConfiguredEquipment(
    CleaningTaskModel.parseBigIntId(taskId, 'Task ID'),
    CleaningTaskModel.parseBigIntId(actorUserId, 'Authenticated user ID'),
  );
}

async function submitEquipmentInspection(taskId, rawInspections, actorUserId) {
  const parsedTaskId = CleaningTaskModel.parseBigIntId(taskId, 'Task ID');
  const parsedActorId = CleaningTaskModel.parseBigIntId(actorUserId, 'Authenticated user ID');
  if (!Array.isArray(rawInspections)) {
    throw Object.assign(new Error('inspections must be an array.'), { statusCode: 400, reason: 'inspection_items_invalid' });
  }
  const inspections = rawInspections.map((item, index) => {
    const equipmentAssetId = CleaningTaskModel.parseBigIntId(item?.equipment_asset_id, `inspections[${index}].equipment_asset_id`);
    const status = String(item?.status ?? '').trim().toUpperCase();
    if (!['NORMAL', 'DAMAGED', 'MISSING'].includes(status)) {
      throw Object.assign(new Error(`inspections[${index}].status must be NORMAL, DAMAGED, or MISSING.`), { statusCode: 400, reason: 'inspection_status_invalid' });
    }
    const notes = CleaningTaskModel.normalizeText(item?.notes, `inspections[${index}].notes`, 1000);
    if (status !== 'NORMAL' && !notes) {
      throw Object.assign(new Error(`inspections[${index}].notes is required for ${status.toLowerCase()} equipment.`), { statusCode: 400, reason: 'inspection_notes_required' });
    }
    return { equipment_asset_id: equipmentAssetId, status, notes };
  });

  const result = await cleaningTaskInspectionDao.submitInspection(parsedTaskId, parsedActorId, inspections);
  const task = await cleaningTaskDao.getTask(parsedTaskId);
  const report = await cleaningTaskInspectionDao.getInspectionReport(parsedTaskId);
  return { ...result, task, report };
}

async function saveInspectionItemCompensation(taskId, inspectionItemId, input, actorUserId) {
  const parsedTaskId = CleaningTaskModel.parseBigIntId(taskId, 'Task ID');
  const parsedInspectionItemId = CleaningTaskModel.parseBigIntId(inspectionItemId, 'Inspection item ID');
  const parsedActorId = CleaningTaskModel.parseBigIntId(actorUserId, 'Authenticated user ID');
  const { decision, amount } = normalizeCompensationDecision(input?.decision, input?.amount);
  return cleaningTaskCompensationDao.saveInspectionItemCompensation({
    taskId: parsedTaskId,
    inspectionItemId: parsedInspectionItemId,
    decision,
    amount,
    decidedByUserId: parsedActorId,
  });
}

async function assignTask(taskId, housekeeperId, actorUserId) {
  return cleaningTaskDao.assignTask(
    CleaningTaskModel.parseBigIntId(taskId, 'Task ID'),
    CleaningTaskModel.parseBigIntId(housekeeperId, 'Housekeeper ID'),
    CleaningTaskModel.parseBigIntId(actorUserId, 'Authenticated user ID'),
  );
}

async function startTask(taskId, actorUserId) {
  return cleaningTaskDao.startTask(
    CleaningTaskModel.parseBigIntId(taskId, 'Task ID'),
    CleaningTaskModel.parseBigIntId(actorUserId, 'Authenticated user ID'),
  );
}

async function completeTask(taskId, actorUserId) {
  return cleaningTaskDao.completeTask(
    CleaningTaskModel.parseBigIntId(taskId, 'Task ID'),
    CleaningTaskModel.parseBigIntId(actorUserId, 'Authenticated user ID'),
  );
}

async function skipTask(taskId, reason, actorUserId) {
  return cleaningTaskDao.skipTask(
    CleaningTaskModel.parseBigIntId(taskId, 'Task ID'),
    CleaningTaskModel.parseBigIntId(actorUserId, 'Authenticated user ID'),
    requireReason(reason, 'skip_reason'),
  );
}

async function listAssignableHousekeepers() {
  return cleaningTaskDao.listAssignableHousekeepers();
}

async function listCheckoutRoomAssignments(bookingId) {
  return cleaningTaskDao.listCheckoutRoomAssignments(
    CleaningTaskModel.parseBigIntId(bookingId, 'Booking ID'),
  );
}

async function assignCheckoutRoomTask(input, actorUserId) {
  return cleaningTaskDao.assignCheckoutRoomTask({
    bookingId: CleaningTaskModel.parseBigIntId(input?.booking_id, 'Booking ID'),
    bookingRoomId: CleaningTaskModel.parseBigIntId(input?.booking_room_id, 'Booking room ID'),
    roomId: CleaningTaskModel.parseRoomId(input?.room_id),
    housekeeperId: CleaningTaskModel.parseBigIntId(input?.assigned_to, 'Housekeeper ID'),
    actorUserId: CleaningTaskModel.parseBigIntId(actorUserId, 'Authenticated user ID'),
  });
}

module.exports = {
  createTask,
  createStayoverTasksForToday,
  listTasks,
  getTask,
  listInspectionEquipment,
  submitEquipmentInspection,
  saveInspectionItemCompensation,
  assignTask,
  startTask,
  completeTask,
  skipTask,
  listAssignableHousekeepers,
  listCheckoutRoomAssignments,
  assignCheckoutRoomTask,
};
