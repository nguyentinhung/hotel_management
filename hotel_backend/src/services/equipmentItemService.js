const equipmentItemDao = require('../dao/equipmentItemDao');
const EquipmentItemModel = require('../models/equipmentItemModel');
const RoomModel = require('../models/roomModel');

async function getEquipmentItems() {
  return EquipmentItemModel.fromResult(await equipmentItemDao.findAll());
}

async function getEquipmentItemById(id) {
  return EquipmentItemModel.fromResult(await equipmentItemDao.findById(parseEquipmentId(id)));
}

async function createEquipmentItem(input) {
  const equipmentItem = EquipmentItemModel.normalizeInput(input);
  return EquipmentItemModel.fromResult(await equipmentItemDao.create(equipmentItem));
}

function parseEquipmentId(id) {
  const rawId = String(id ?? '');
  if (!/^\d+$/.test(rawId)) {
    throw Object.assign(new Error('Equipment ID must be a positive integer.'), { statusCode: 400 });
  }
  const parsedId = Number(rawId);
  if (!Number.isSafeInteger(parsedId) || parsedId < 1 || parsedId > 2147483647) {
    throw Object.assign(new Error('Equipment ID must be a positive integer.'), { statusCode: 400 });
  }
  return parsedId;
}

async function updateEquipmentItem(id, input) {
  const parsedId = parseEquipmentId(id);
  const equipmentItem = EquipmentItemModel.normalizeInput(input);
  return EquipmentItemModel.fromResult(await equipmentItemDao.update(parsedId, equipmentItem));
}

async function deleteEquipmentItem(id) {
  return EquipmentItemModel.fromResult(await equipmentItemDao.deleteById(parseEquipmentId(id)));
}

async function getEquipmentRooms(id) {
  const equipmentId = parseEquipmentId(id);
  const equipmentItem = await equipmentItemDao.findById(equipmentId);
  if (!equipmentItem) return null;
  return RoomModel.fromResult(await equipmentItemDao.findRoomsForEquipment(equipmentId));
}

async function assignEquipmentToRooms(id, input) {
  const equipmentId = parseEquipmentId(id);
  const roomIds = EquipmentItemModel.normalizeRoomIds(input?.room_ids);
  const updated = await equipmentItemDao.replaceRoomAssignments(equipmentId, roomIds);
  if (!updated) return null;
  return RoomModel.fromResult(await equipmentItemDao.findRoomsForEquipment(equipmentId));
}

module.exports = { getEquipmentItems, getEquipmentItemById, createEquipmentItem, updateEquipmentItem, deleteEquipmentItem, getEquipmentRooms, assignEquipmentToRooms };
