const crypto = require('node:crypto');

const TASK_TYPES = Object.freeze([
  'CHECKOUT_CLEANING',
  'STAYOVER_CLEANING',
  'ON_DEMAND_CLEANING',
]);

const STATUSES = Object.freeze([
  'PENDING_ASSIGNMENT',
  'ASSIGNED',
  'IN_PROGRESS',
  'COMPLETED',
  'SKIPPED',
  'CANCELLED',
  'NOT_STARTED',
  'UNDER_MAINTENANCE',
]);

const PRIORITIES = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
const WHITESPACE_ONLY = /[ \t\n\v\f\r\u00a0]/g;

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
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 2147483647) {
    throw inputError('room_id must be a positive SQL INT.');
  }
  return parsed;
}

function normalizeText(value, field, maxLength = 500) {
  if (value == null) return null;
  if (typeof value !== 'string') throw inputError(`${field} must be a string.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw inputError(`${field} must be ${maxLength} characters or fewer.`);
  return normalized || null;
}

function normalizeCreateInput(input) {
  const taskType = String(input?.task_type ?? '').trim().toUpperCase();
  if (!TASK_TYPES.includes(taskType)) throw inputError('task_type is not supported.');

  const priority = input?.priority == null || input.priority === ''
    ? null
    : String(input.priority).trim().toUpperCase();
  if (priority != null && !PRIORITIES.includes(priority)) throw inputError('priority must be LOW, MEDIUM, HIGH, or URGENT.');

  return {
    task_type: taskType,
    room_id: parseRoomId(input?.room_id),
    booking_room_id: input?.booking_room_id == null || input.booking_room_id === ''
      ? null
      : parseBigIntId(input.booking_room_id, 'booking_room_id'),
    priority,
    special_instructions: normalizeText(input?.special_instructions, 'special_instructions'),
    notes: normalizeText(input?.notes, 'notes'),
    request_key: normalizeRequestKey(input?.request_key),
  };
}

function normalizeRequestKey(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(raw)) {
    throw inputError('request_key must be a UUID and must be retained when retrying the same request.');
  }
  return raw;
}

function hashCreatePayload(input, creatorUserId) {
  const canonicalPayload = JSON.stringify({
    created_by_user_id: String(creatorUserId),
    task_type: input.task_type,
    room_id: input.room_id,
    booking_room_id: input.booking_room_id,
    priority: input.priority,
    special_instructions: input.special_instructions,
    notes: input.notes,
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
    if (!match || Number(match[1]) < 1 || Number.isNaN(parsedDate.getTime())
      || parsedDate.toISOString().slice(0, 10) !== businessDate) {
      throw inputError('business_date must be a valid date in YYYY-MM-DD format.');
    }
    filters.business_date = businessDate;
  }

  const limit = query.limit == null || query.limit === '' ? 50 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw inputError('limit must be between 1 and 100.');
  filters.limit = limit;
  return filters;
}

module.exports = {
  TASK_TYPES,
  STATUSES,
  PRIORITIES,
  parseBigIntId,
  parseRoomId,
  normalizeText,
  normalizeCreateInput,
  normalizeListFilters,
  hashCreatePayload,
};
