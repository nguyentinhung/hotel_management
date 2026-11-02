const roomDao = require('../dao/roomDao');
const { toCheckRoomAvailabilityItem } = require('../dto/room/check-availability/check-availability-response.dto');

class RoomInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RoomInputError';
  }
}

function normalizeRoomInput(input = {}) {
  const { roomNumber, error: roomNumberError } = normalizeRoomNumber(input.room_number);
  if (roomNumberError) throw new RoomInputError(roomNumberError);

  const roomTypeId = Number(input.room_type_id);
  if (!Number.isInteger(roomTypeId) || roomTypeId < 1) {
    throw new RoomInputError('Vui l\u00f2ng ch\u1ecdn lo\u1ea1i ph\u00f2ng h\u1ee3p l\u1ec7.');
  }

  const { floor, error: floorError } = normalizeFloor(input.floor);
  if (floorError) throw new RoomInputError(floorError);
  return { roomNumber, roomTypeId, floor };
}

function normalizeRoomNumber(value) {
  if (value != null && typeof value !== 'string') return { roomNumber: '', error: 'Số phòng phải là số nguyên dương.' };
  const roomNumber = typeof value === 'string' ? value.trim() : '';
  if (!roomNumber) return { roomNumber, error: 'Vui lòng nhập số phòng.' };
  if (roomNumber.length > 10) return { roomNumber, error: 'Số phòng không được vượt quá 10 ký tự.' };
  if (!/^[0-9]+$/.test(roomNumber) || /^0+$/.test(roomNumber)) {
    return { roomNumber, error: 'Số phòng phải là số nguyên dương.' };
  }
  return { roomNumber, error: '' };
}

function normalizeFloor(value) {
  if (value == null || (typeof value === 'string' && !value.trim())) return { floor: NaN, error: 'Vui lòng nhập số tầng.' };
  const normalized = typeof value === 'string' ? value.trim() : value;
  if ((typeof normalized === 'string' && !/^-?\d+$/.test(normalized))
    || (typeof normalized !== 'string' && (typeof normalized !== 'number' || !Number.isInteger(normalized)))) {
    return { floor: NaN, error: 'Số tầng phải là số nguyên.' };
  }
  const floor = Number(normalized);
  if (floor < 0) return { floor, error: 'Số tầng không được nhỏ hơn 0.' };
  if (floor > 255) return { floor, error: 'Số tầng không được lớn hơn 255.' };
  return { floor, error: '' };
}

async function createRoom(input) {
  return await roomDao.createRoom(normalizeRoomInput(input));
}

async function updateRoom(roomIdValue, input) {
  const roomId = Number(roomIdValue);
  if (!Number.isInteger(roomId) || roomId < 1) {
    throw new RoomInputError('M\u00e3 ph\u00f2ng kh\u00f4ng h\u1ee3p l\u1ec7.');
  }
  const normalized = normalizeRoomInput(input);
  return await roomDao.updateRoom({ roomId, ...normalized });
}

async function checkRoomAvailability(...args) {
  return (await roomDao.checkRoomAvailability(...args)).map(toCheckRoomAvailabilityItem);
}

async function getRoomList(...args) {
  return await roomDao.getRoomList(...args);
}

async function getRoomDetails(...args) {
  return await roomDao.getRoomDetails(...args);
}

async function getAvailableRoomsForType(...args) {
  return await roomDao.getAvailableRoomsForType(...args);
}

async function deleteRoom(...args) {
  return await roomDao.deleteRoom(...args);
}

async function updateRoomStatus(...args) {
  return await roomDao.updateRoomStatus(...args);
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
