const equipmentItemDao = require('../dao/equipmentItemDao');

function normalizeEquipmentInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw Object.assign(new Error('Equipment name is required and must not exceed 100 characters.'), { statusCode: 400 });
  }
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 100) {
    throw Object.assign(new Error('Equipment name is required and must not exceed 100 characters.'), { statusCode: 400 });
  }
  if (typeof input.is_active !== 'boolean') throw Object.assign(new Error('Active status is required.'), { statusCode: 400 });
  const rawUnitPrice = input.unit_price;
  const unitPrice = rawUnitPrice === '' || rawUnitPrice == null ? 0 : Number(rawUnitPrice);
  if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 9999999999.99) {
    throw Object.assign(new Error('Equipment price must be a non-negative amount.'), { statusCode: 400 });
  }
  const equipmentItem = { name, is_active: input.is_active, unit_price: unitPrice };
  if (Object.hasOwn(input, 'description')) {
    const description = input.description;
    if (description != null && typeof description !== 'string') {
      throw Object.assign(new Error('Equipment description must be text and must not exceed 500 characters.'), { statusCode: 400 });
    }
    if (typeof description === 'string' && description.length > 500) {
      throw Object.assign(new Error('Equipment description must be text and must not exceed 500 characters.'), { statusCode: 400 });
    }
    equipmentItem.description = typeof description === 'string' ? description.trim() || null : null;
  }
  return equipmentItem;
}

function normalizeRoomIds(input) {
  if (!Array.isArray(input) || input.length > 500) {
    throw Object.assign(new Error('Room IDs must be an array containing no more than 500 rooms.'), { statusCode: 400 });
  }
  const roomIds = input.map((value) => Number(value));
  if (roomIds.some((id) => !Number.isSafeInteger(id) || id < 1 || id > 2147483647)) {
    throw Object.assign(new Error('Every room ID must be a positive integer.'), { statusCode: 400 });
  }
  return [...new Set(roomIds)];
}

async function getEquipmentItems() {
  return await equipmentItemDao.findAll();
}

async function getEquipmentItemById(id) {
  return await equipmentItemDao.findById(parseEquipmentId(id));
}

async function createEquipmentItem(input) {
  const equipmentItem = normalizeEquipmentInput(input);
  return await equipmentItemDao.create(equipmentItem);
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
  const equipmentItem = normalizeEquipmentInput(input);
  return await equipmentItemDao.update(parsedId, equipmentItem);
}

async function deleteEquipmentItem(id) {
  return await equipmentItemDao.deleteById(parseEquipmentId(id));
}

async function getEquipmentRooms(id) {
  const equipmentId = parseEquipmentId(id);
  const equipmentItem = await equipmentItemDao.findById(equipmentId);
  if (!equipmentItem) return null;
  return await equipmentItemDao.findRoomsForEquipment(equipmentId);
}

async function assignEquipmentToRooms(id, input) {
  const equipmentId = parseEquipmentId(id);
  const roomIds = normalizeRoomIds(input?.room_ids);
  const updated = await equipmentItemDao.replaceRoomAssignments(equipmentId, roomIds);
  if (!updated) return null;
  return await equipmentItemDao.findRoomsForEquipment(equipmentId);
}

module.exports = { getEquipmentItems, getEquipmentItemById, createEquipmentItem, updateEquipmentItem, deleteEquipmentItem, getEquipmentRooms, assignEquipmentToRooms };
