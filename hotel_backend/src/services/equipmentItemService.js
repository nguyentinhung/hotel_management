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

module.exports = { getEquipmentItems, getEquipmentItemById, createEquipmentItem, updateEquipmentItem, deleteEquipmentItem };
