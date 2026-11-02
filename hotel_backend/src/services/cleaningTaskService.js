const cleaningTaskDao = require('../dao/cleaningTaskDao');
const cleaningTaskInspectionDao = require('../dao/cleaningTaskInspectionDao');
const cleaningTaskCompensationDao = require('../dao/cleaningTaskCompensationDao');
const crypto = require('node:crypto');

const TASK_TYPES = ['CHECKOUT_CLEANING', 'STAYOVER_CLEANING', 'ON_DEMAND_CLEANING'];
const STATUSES = ['PENDING_ASSIGNMENT', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'CANCELLED', 'NOT_STARTED', 'UNDER_MAINTENANCE'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

function inputError(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function parseBigIntId(value, label) {
  const raw = String(value ?? '');
  if (!/^\d+$/.test(raw)) throw inputError(`${label} must be a positive SQL BIGINT.`);
  let parsed;
  try { parsed = BigInt(raw); } catch { throw inputError(`${label} must be a positive SQL BIGINT.`); }
  if (parsed < 1n || parsed > 9223372036854775807n) throw inputError(`${label} must be a positive SQL BIGINT.`);
  return parsed.toString();
}

function parseRoomId(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 2147483647) throw inputError('room_id must be a positive SQL INT.');
  return parsed;
}

function normalizeText(value, field, maxLength = 500) {
  if (value == null) return null;
  if (typeof value !== 'string') throw inputError(`${field} must be a string.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw inputError(`${field} must be ${maxLength} characters or fewer.`);
  return normalized || null;
}

function normalizeRequestKey(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(raw)) {
    throw inputError('request_key must be a UUID and must be retained when retrying the same request.');
  }
  return raw;
}

function normalizeCreateInput(input) {
  const taskType = String(input?.task_type ?? '').trim().toUpperCase();
  if (!TASK_TYPES.includes(taskType)) throw inputError('task_type is not supported.');
  const priority = input?.priority == null || input.priority === '' ? null : String(input.priority).trim().toUpperCase();
  if (priority != null && !PRIORITIES.includes(priority)) throw inputError('priority must be LOW, MEDIUM, HIGH, or URGENT.');
  return {
    task_type: taskType,
    room_id: parseRoomId(input?.room_id),
    booking_room_id: input?.booking_room_id == null || input.booking_room_id === '' ? null : parseBigIntId(input.booking_room_id, 'booking_room_id'),
    priority,
    special_instructions: normalizeText(input?.special_instructions, 'special_instructions'),
    notes: normalizeText(input?.notes, 'notes'),
    request_key: normalizeRequestKey(input?.request_key),
  };
}

function hashCreatePayload(input, creatorUserId) {
  const canonicalPayload = JSON.stringify({
    created_by_user_id: String(creatorUserId), task_type: input.task_type, room_id: input.room_id,
    booking_room_id: input.booking_room_id, priority: input.priority,
    special_instructions: input.special_instructions, notes: input.notes,
  });
  return crypto.createHash('sha256').update(canonicalPayload, 'utf8').digest();
}

function normalizeListFilters(query = {}) {
  const filters = {};
  if (query.status != null && query.status !== '') {
    const status = String(query.status).trim().toUpperCase();
    if (!STATUSES.includes(status)) throw inputError('status is not supported.');
    filters.status = status;
  }
  if (query.task_type != null && query.task_type !== '') {
    const taskType = String(query.task_type).trim().toUpperCase();
    if (!TASK_TYPES.includes(taskType)) throw inputError('task_type is not supported.');
    filters.task_type = taskType;
  }
  if (query.room_id != null && query.room_id !== '') filters.room_id = parseRoomId(query.room_id);
  if (query.assigned_to != null && query.assigned_to !== '') filters.assigned_to = parseBigIntId(query.assigned_to, 'assigned_to');
  if (query.business_date != null && query.business_date !== '') {
    const businessDate = String(query.business_date).trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(businessDate);
    const parsedDate = new Date(`${businessDate}T00:00:00.000Z`);
    if (!match || Number(match[1]) < 1 || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== businessDate) {
      throw inputError('business_date must be a valid date in YYYY-MM-DD format.');
    }
    filters.business_date = businessDate;
  }
  const limit = query.limit == null || query.limit === '' ? 50 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw inputError('limit must be between 1 and 100.');
  filters.limit = limit;
  return filters;
}

function requireReason(value, field) {
  const reason = normalizeText(value, field, 500);
  if (!reason || !reason.replace(/[ \t\n\v\f\r\u00a0]/g, '')) {
    throw Object.assign(new Error(`${field} is required and cannot contain only whitespace.`), { statusCode: 400 });
  }
  return reason;
}

function normalizeCompensationDecision(decision) {
  if (decision !== 'COMPENSATION' && decision !== 'NO_COMPENSATION') {
    throw Object.assign(new Error('decision must be COMPENSATION or NO_COMPENSATION.'), { statusCode: 400 });
  }
  return { decision };
}

async function createTask(input, creatorUserId) {
  const normalized = normalizeCreateInput(input);
  if (normalized.task_type !== 'ON_DEMAND_CLEANING' && normalized.booking_room_id == null) {
    throw Object.assign(new Error('booking_room_id is required for checkout and stayover cleaning.'), { statusCode: 400 });
  }
  const parsedCreatorUserId = parseBigIntId(creatorUserId, 'Authenticated user ID');
  const hash = hashCreatePayload(normalized, parsedCreatorUserId);
  return cleaningTaskDao.createTask(normalized, {
    creatorUserId: parsedCreatorUserId,
    requestHash: hash,
  });
}

async function createStayoverTasksForToday(creatorUserId) {
  const parsedCreatorUserId = parseBigIntId(creatorUserId, 'Authenticated user ID');
  return cleaningTaskDao.createStayoverTasksForToday(parsedCreatorUserId);
}

async function listTasks(query, auth) {
  const filters = normalizeListFilters(query);
  const assignedTo = auth.roleCode === 'HOUSEKEEPER'
    ? parseBigIntId(auth.userId, 'Authenticated user ID')
    : null;
  return cleaningTaskDao.listTasks(filters, { assignedTo });
}

async function getTask(taskId, auth) {
  const parsedTaskId = parseBigIntId(taskId, 'Task ID');
  const assignedTo = auth.roleCode === 'HOUSEKEEPER'
    ? parseBigIntId(auth.userId, 'Authenticated user ID')
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
    parseBigIntId(taskId, 'Task ID'),
    parseBigIntId(actorUserId, 'Authenticated user ID'),
  );
}

async function submitEquipmentInspection(taskId, rawInspections, actorUserId) {
  const parsedTaskId = parseBigIntId(taskId, 'Task ID');
  const parsedActorId = parseBigIntId(actorUserId, 'Authenticated user ID');
  if (!Array.isArray(rawInspections)) {
    throw Object.assign(new Error('inspections must be an array.'), { statusCode: 400, reason: 'inspection_items_invalid' });
  }
  const inspections = rawInspections.map((item, index) => {
    const equipmentAssetId = parseBigIntId(item?.equipment_asset_id, `inspections[${index}].equipment_asset_id`);
    const status = String(item?.status ?? '').trim().toUpperCase();
    if (!['NORMAL', 'DAMAGED', 'MISSING'].includes(status)) {
      throw Object.assign(new Error(`inspections[${index}].status must be NORMAL, DAMAGED, or MISSING.`), { statusCode: 400, reason: 'inspection_status_invalid' });
    }
    const notes = normalizeText(item?.notes, `inspections[${index}].notes`, 1000);
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
  const parsedTaskId = parseBigIntId(taskId, 'Task ID');
  const parsedInspectionItemId = parseBigIntId(inspectionItemId, 'Inspection item ID');
  const parsedActorId = parseBigIntId(actorUserId, 'Authenticated user ID');
  const { decision } = normalizeCompensationDecision(input?.decision);
  return cleaningTaskCompensationDao.saveInspectionItemCompensation({
    taskId: parsedTaskId,
    inspectionItemId: parsedInspectionItemId,
    decision,
    decidedByUserId: parsedActorId,
  });
}

async function assignTask(taskId, housekeeperId, actorUserId) {
  return cleaningTaskDao.assignTask(
    parseBigIntId(taskId, 'Task ID'),
    parseBigIntId(housekeeperId, 'Housekeeper ID'),
    parseBigIntId(actorUserId, 'Authenticated user ID'),
  );
}

async function startTask(taskId, actorUserId) {
  return cleaningTaskDao.startTask(
    parseBigIntId(taskId, 'Task ID'),
    parseBigIntId(actorUserId, 'Authenticated user ID'),
  );
}

async function completeTask(taskId, actorUserId) {
  return cleaningTaskDao.completeTask(
    parseBigIntId(taskId, 'Task ID'),
    parseBigIntId(actorUserId, 'Authenticated user ID'),
  );
}

async function skipTask(taskId, reason, actorUserId) {
  return cleaningTaskDao.skipTask(
    parseBigIntId(taskId, 'Task ID'),
    parseBigIntId(actorUserId, 'Authenticated user ID'),
    requireReason(reason, 'skip_reason'),
  );
}

async function listAssignableHousekeepers() {
  return cleaningTaskDao.listAssignableHousekeepers();
}

async function listCheckoutRoomAssignments(bookingId) {
  return cleaningTaskDao.listCheckoutRoomAssignments(
    parseBigIntId(bookingId, 'Booking ID'),
  );
}

async function assignCheckoutRoomTask(input, actorUserId) {
  return cleaningTaskDao.assignCheckoutRoomTask({
    bookingId: parseBigIntId(input?.booking_id, 'Booking ID'),
    bookingRoomId: parseBigIntId(input?.booking_room_id, 'Booking room ID'),
    roomId: parseRoomId(input?.room_id),
    housekeeperId: parseBigIntId(input?.assigned_to, 'Housekeeper ID'),
    actorUserId: parseBigIntId(actorUserId, 'Authenticated user ID'),
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
