const roomDao = require('../dao/roomDao');
const roomEquipmentAssignmentDao = require('../dao/roomEquipmentAssignmentDao');

function parsePositiveId(value, label, maximum = Number.MAX_SAFE_INTEGER) {
  const raw = String(value ?? '');
  if (!/^\d+$/.test(raw)) throw Object.assign(new Error(`${label} must be a positive integer.`), { statusCode: 400 });
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw Object.assign(new Error(`${label} must be a positive integer.`), { statusCode: 400 });
  }
  return parsed;
}

function assignmentError(reason, status) {
  const errors = {
    room_not_found: [404, 'Room not found.'],
    asset_not_found: [404, 'Equipment asset not found.'],
    asset_type_mismatch: [409, 'The selected equipment asset does not belong to the selected equipment type.'],
    equipment_type_inactive: [409, 'The equipment type is inactive and cannot be assigned to a room.'],
    asset_not_available: [409, `This equipment asset is ${status || 'not available'} and cannot be assigned.`],
    already_assigned_to_room: [409, 'This equipment asset is already assigned to this room.'],
    assigned_to_another_room: [409, 'This equipment asset is already assigned to another room.'],
    assignment_conflict: [409, 'This equipment asset was assigned by another request. Refresh the list and try again.'],
    assignment_reference_conflict: [409, 'The room or equipment asset changed before the assignment was saved. Refresh and try again.'],
    assignment_not_found: [409, 'This equipment asset is not actively assigned to this room.'],
    assigned_to_another_room: [409, 'This equipment asset is assigned to another room.'],
    asset_status_conflict: [409, `This equipment asset is ${status || 'not available'}; its status was not changed.`],
  };
  const [statusCode, message] = errors[reason] || [409, 'This equipment asset cannot be assigned to the room.'];
  return Object.assign(new Error(message), { statusCode, reason });
}

async function getRoomAssignments(roomId) {
  const parsedRoomId = parsePositiveId(roomId, 'Room ID', 2147483647);
  if (!await roomDao.getRoomDetails(parsedRoomId)) return null;
  return roomEquipmentAssignmentDao.listActiveByRoomId(parsedRoomId);
}

async function getAssignableAssets(roomId, equipmentItemId) {
  const parsedRoomId = parsePositiveId(roomId, 'Room ID', 2147483647);
  const parsedEquipmentItemId = parsePositiveId(equipmentItemId, 'Equipment type ID', 2147483647);
  if (!await roomDao.getRoomDetails(parsedRoomId)) return null;
  return roomEquipmentAssignmentDao.listAssignableAssets(parsedEquipmentItemId);
}

async function assignEquipmentToRoom(roomId, equipmentAssetId, equipmentItemId) {
  const parsedRoomId = parsePositiveId(roomId, 'Room ID', 2147483647);
  const parsedAssetId = parsePositiveId(equipmentAssetId, 'Equipment asset ID');
  const parsedEquipmentItemId = parsePositiveId(equipmentItemId, 'Equipment type ID', 2147483647);
  const result = await roomEquipmentAssignmentDao.assignToRoom(parsedRoomId, parsedAssetId, parsedEquipmentItemId);
  if (result.reason) throw assignmentError(result.reason, result.status);
  return result.assignment;
}

async function unassignEquipmentFromRoom(roomId, equipmentAssetId) {
  const parsedRoomId = parsePositiveId(roomId, 'Room ID', 2147483647);
  const parsedAssetId = parsePositiveId(equipmentAssetId, 'Equipment asset ID');
  const result = await roomEquipmentAssignmentDao.unassignFromRoom(parsedRoomId, parsedAssetId);
  if (result.reason) throw assignmentError(result.reason, result.status);
  return result.assignment;
}

module.exports = { getRoomAssignments, getAssignableAssets, assignEquipmentToRoom, unassignEquipmentFromRoom };
