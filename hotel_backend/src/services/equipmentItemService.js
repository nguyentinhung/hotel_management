const equipmentItemDao = require('../dao/equipmentItemDao');
const EquipmentItemModel = require('../models/equipmentItemModel');

async function getEquipmentItems() {
  return equipmentItemDao.findAll();
}

async function getEquipmentItemById(id) {
  return equipmentItemDao.findById(parseEquipmentId(id));
}

async function createEquipmentItem(input) {
  const equipmentItem = EquipmentItemModel.normalizeInput(input);
  return equipmentItemDao.create(equipmentItem);
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
  return equipmentItemDao.update(parsedId, equipmentItem);
}

async function deleteEquipmentItem(id) {
  return equipmentItemDao.deleteById(parseEquipmentId(id));
}

async function getEquipmentRooms(id) {
  const equipmentId = parseEquipmentId(id);
  const equipmentItem = await equipmentItemDao.findById(equipmentId);
  if (!equipmentItem) return null;
  return equipmentItemDao.findRoomsForEquipment(equipmentId);
}

async function assignEquipmentToRooms(id, input) {
  const equipmentId = parseEquipmentId(id);
  const roomIds = EquipmentItemModel.normalizeRoomIds(input?.room_ids);
  const updated = await equipmentItemDao.replaceRoomAssignments(equipmentId, roomIds);
  if (!updated) return null;
  return equipmentItemDao.findRoomsForEquipment(equipmentId);
}

module.exports = { getEquipmentItems, getEquipmentItemById, createEquipmentItem, updateEquipmentItem, deleteEquipmentItem, getEquipmentRooms, assignEquipmentToRooms };
