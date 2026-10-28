const roomDao = require('../dao/roomDao');
const RoomModel = require('../models/roomModel');
const RoomAvailabilityModel = require('../models/roomAvailabilityModel');

class RoomInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RoomInputError';
  }
}

function normalizeRoomInput(input = {}) {
  const { roomNumber, error: roomNumberError } = RoomModel.normalizeRoomNumber(input.room_number);
  if (roomNumberError) throw new RoomInputError(roomNumberError);

  const roomTypeId = Number(input.room_type_id);
  if (!Number.isInteger(roomTypeId) || roomTypeId < 1) {
    throw new RoomInputError('Vui l\u00f2ng ch\u1ecdn lo\u1ea1i ph\u00f2ng h\u1ee3p l\u1ec7.');
  }

  const { floor, error: floorError } = RoomModel.normalizeFloor(input.floor);
  if (floorError) throw new RoomInputError(floorError);
  return { roomNumber, roomTypeId, floor };
}

async function createRoom(input) {
  return RoomModel.fromResult(await roomDao.createRoom(normalizeRoomInput(input)));
}

async function updateRoom(roomIdValue, input) {
  const roomId = Number(roomIdValue);
  if (!Number.isInteger(roomId) || roomId < 1) {
    throw new RoomInputError('M\u00e3 ph\u00f2ng kh\u00f4ng h\u1ee3p l\u1ec7.');
  }
  const normalized = normalizeRoomInput(input);
  return RoomModel.fromResult(await roomDao.updateRoom({ roomId, ...normalized }));
}

async function checkRoomAvailability(...args) {
  return RoomAvailabilityModel.fromResult(await roomDao.checkRoomAvailability(...args));
}

async function getRoomList(...args) {
  return RoomModel.fromResult(await roomDao.getRoomList(...args));
}

async function getRoomDetails(...args) {
  return RoomModel.fromResult(await roomDao.getRoomDetails(...args));
}

async function getAvailableRoomsForType(...args) {
  return RoomModel.fromResult(await roomDao.getAvailableRoomsForType(...args));
}

async function deleteRoom(...args) {
  return RoomModel.fromResult(await roomDao.deleteRoom(...args));
}

async function updateRoomStatus(...args) {
  return RoomStatusModel.fromResult(await roomDao.updateRoomStatus(...args));
}

module.exports = {
  checkRoomAvailability,
  createRoom,
  updateRoom,
  deleteRoom,
  updateRoomStatus,
  getAvailableRoomsForType,
  getRoomList,
  getRoomDetails,
  RoomInputError,
};
