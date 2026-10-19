const roomTypeDao = require('../dao/roomTypeDao');

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
  const description = input.description;
  const basePrice = Number(input.base_price);
  const maxAdults = Number(input.max_adults);
  const maxChildren = Number(input.max_children);
  if (!name || name.length > 100) fail('Tên loại phòng là bắt buộc và tối đa 100 ký tự.');
  if (!Number.isFinite(basePrice) || basePrice < 0
    || !Number.isInteger(maxAdults) || maxAdults < 1 || maxAdults > 255
    || !Number.isInteger(maxChildren) || maxChildren < 0 || maxChildren > 255) {
    fail(update
      ? 'Giá và sức chứa không hợp lệ.'
      : 'Giá phải từ 0 trở lên; sức chứa người lớn phải từ 1 và các sức chứa phải là số nguyên hợp lệ.');
  }
  if (description != null && typeof description !== 'string') fail('Mô tả không hợp lệ.');
  const amenityIds = normalizeAmenityIds(input.amenity_ids);
  if (amenityIds == null) fail('Danh sách tiện nghi không hợp lệ.');
  return {
    data: { name, description: description?.trim() || null, basePrice, maxAdults, maxChildren },
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
  return roomTypeDao.deleteRoomType(roomTypeId);
}

module.exports = {
  createRoomType, updateRoomType, deleteRoomType,
  getPrimaryImage: (id) => roomTypeDao.getPrimaryImage(id),
  savePrimaryImage: (id, url, file) => roomTypeDao.savePrimaryImage(id, url, file),
};
