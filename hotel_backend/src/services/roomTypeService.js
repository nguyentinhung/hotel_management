const roomTypeDao = require('../dao/roomTypeDao');
const RoomTypeModel = require('../models/roomTypeModel');
const RoomTypeImageModel = require('../models/roomTypeImageModel');

function fail(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}





function normalizeAmenityIds(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) return null;
  const ids = value.map(Number);
  if (ids.some((id) => !Number.isInteger(id) || id < 1)) return null;
  return [...new Set(ids)];
}

function normalizeRoomTypeInput(input = {}, update = false) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const basePrice = Number(input.base_price);
  const maxAdults = Number(input.max_adults);
  const maxChildren = Number(input.max_children);
  if (!name || name.length > 100) {
    const error = new Error('Tên loại phòng là bắt buộc và tối đa 100 ký tự.');
    error.statusCode = 400;
    throw error;
  }
  if (!Number.isFinite(basePrice) || basePrice < 0
    || !Number.isInteger(maxAdults) || maxAdults < 1 || maxAdults > 255
    || !Number.isInteger(maxChildren) || maxChildren < 0 || maxChildren > 255) {
    const error = new Error(update ? 'Giá và sức chứa không hợp lệ.' : 'Giá hoặc sức chứa không hợp lệ.');
    error.statusCode = 400;
    throw error;
  }
  if (input.description != null && typeof input.description !== 'string') {
    const error = new Error('Mô tả không hợp lệ.');
    error.statusCode = 400;
    throw error;
  }
  const amenityIds = normalizeAmenityIds(input.amenity_ids);
  if (amenityIds == null) {
    const error = new Error('Danh sách tiện nghi không hợp lệ.');
    error.statusCode = 400;
    throw error;
  }
  return {
    data: { name, description: input.description?.trim() || null, basePrice, maxAdults, maxChildren },
    amenityIds,
  };
}

async function assertRoomTypeReferences(name, amenityIds, exceptId = null) {
  if (await roomTypeDao.findRoomTypeByName(name, exceptId)) {
    fail(exceptId == null ? 'Tên loại phòng đã tồn tại.' : 'Tên loại phòng đã được sử dụng.', 409);
  }
  if (!await roomTypeDao.amenitiesExist(amenityIds)) fail('Một hoặc nhiều tiện nghi không tồn tại.');
}

async function createRoomType(input) {
  const { data, amenityIds } = normalizeRoomTypeInput(input, false);
  await assertRoomTypeReferences(data.name, amenityIds);
  const roomType = await roomTypeDao.createRoomType(data, amenityIds);
  return { ...roomType, base_price: Number(roomType.base_price), amenities: [], amenity_ids: amenityIds };
}

async function updateRoomType(roomTypeId, input) {
  if (!Number.isInteger(roomTypeId) || roomTypeId < 1) fail('Mã loại phòng không hợp lệ.');
  const { data, amenityIds } = normalizeRoomTypeInput(input, true);
  await assertRoomTypeReferences(data.name, amenityIds, roomTypeId);
  const roomType = await roomTypeDao.updateRoomType(roomTypeId, data, amenityIds);
  if (!roomType) return null;
  return { ...roomType, base_price: Number(roomType.base_price), amenity_ids: amenityIds };
}

async function deleteRoomType(roomTypeId) {
  if (!Number.isInteger(roomTypeId) || roomTypeId < 1) fail('Mã loại phòng không hợp lệ.');
  return await roomTypeDao.deleteRoomType(roomTypeId);
}

module.exports = {
  createRoomType, updateRoomType, deleteRoomType,
  getPrimaryImage: async (id) => RoomTypeImageModel.fromResult(await roomTypeDao.getPrimaryImage(id)),
  savePrimaryImage: async (id, url, file) => RoomTypeImageModel.fromResult(await roomTypeDao.savePrimaryImage(id, url, file)),
};
