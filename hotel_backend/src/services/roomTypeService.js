const roomTypeDao = require('../dao/roomTypeDao');
const RoomTypeModel = require('../models/roomTypeModel');

function fail(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}





async function assertRoomTypeReferences(name, amenityIds, exceptId = null) {
  if (await roomTypeDao.findRoomTypeByName(name, exceptId)) {
    fail(exceptId == null ? 'Tên loại phòng đã tồn tại.' : 'Tên loại phòng đã được sử dụng.', 409);
  }
  if (!await roomTypeDao.amenitiesExist(amenityIds)) fail('Một hoặc nhiều tiện nghi không tồn tại.');
}

async function createRoomType(input) {
  const { data, amenityIds } = RoomTypeModel.normalizeInput(input, false);
  await assertRoomTypeReferences(data.name, amenityIds);
  const roomType = await roomTypeDao.createRoomType(data, amenityIds);
  return { ...roomType, base_price: Number(roomType.base_price), amenities: [], amenity_ids: amenityIds };
}

async function updateRoomType(roomTypeId, input) {
  if (!Number.isInteger(roomTypeId) || roomTypeId < 1) fail('Mã loại phòng không hợp lệ.');
  const { data, amenityIds } = RoomTypeModel.normalizeInput(input, true);
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
