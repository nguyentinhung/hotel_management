const { checkRoomAvailability, createRoom: saveRoom, updateRoom: updateExistingRoom, getAvailableRoomsForType, getRoomList: fetchRoomList, getRoomDetails: fetchRoomDetails } = require('../dao/roomDao');

function validateRoomNumber(value) {
  if (value != null && typeof value !== 'string') {
    return { roomNumber: '', error: 'Số phòng phải là số nguyên dương.' };
  }
  const roomNumber = typeof value === 'string' ? value.trim() : '';
  if (!roomNumber) return { roomNumber, error: 'Vui lòng nhập số phòng.' };
  if (roomNumber.length > 10) return { roomNumber, error: 'Số phòng không được vượt quá 10 ký tự.' };
  if (!/^[0-9]+$/.test(roomNumber) || /^0+$/.test(roomNumber)) {
    return { roomNumber, error: 'Số phòng phải là số nguyên dương.' };
  }
  return { roomNumber, error: '' };
}

function validateFloor(value) {
  if (value == null || (typeof value === 'string' && !value.trim())) {
    return { floor: NaN, error: 'Vui lòng nhập số tầng.' };
  }

  const normalized = typeof value === 'string' ? value.trim() : value;
  if (
    (typeof normalized === 'string' && !/^-?\d+$/.test(normalized))
    || (typeof normalized !== 'string' && (typeof normalized !== 'number' || !Number.isInteger(normalized)))
  ) {
    return { floor: NaN, error: 'Số tầng phải là số nguyên.' };
  }

  const floor = Number(normalized);
  if (floor < 0) return { floor, error: 'Số tầng không được nhỏ hơn 0.' };
  if (floor > 255) return { floor, error: 'Số tầng không được lớn hơn 255.' };
  return { floor, error: '' };
}

/**
 * ============================================================================
 * CONTROLLER: KIỂM TRA PHÒNG TRỐNG (CHECK ROOM AVAILABILITY)
 * ============================================================================
 * Cung cấp API cho cả Guest/Customer (ở trang chủ, tìm phòng) và Receptionist
 * (ở dashboard quản lý đặt phòng tại quầy).
 */

/**
 * Helper định dạng ngày YYYY-MM-DD
 */
function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

async function getRoomList(req, res) {
  try {
    const rooms = await fetchRoomList();
    return res.json({ success: true, rooms });
  } catch (error) {
    console.error('Get room list error:', error);
    return res.status(500).json({ success: false, message: 'Không thể tải danh sách phòng.' });
  }
}

async function getRoomDetails(req, res) {
  const roomId = Number(req.params.roomId);
  if (!Number.isInteger(roomId) || roomId < 1) {
    return res.status(400).json({ success: false, message: 'Mã phòng không hợp lệ.' });
  }

  try {
    const room = await fetchRoomDetails(roomId);
    if (!room) {
      return res.status(404).json({ success: false, message: 'Phòng không còn tồn tại hoặc không thể tìm thấy.' });
    }
    return res.json({ success: true, room });
  } catch (error) {
    console.error('Get room details error:', error);
    return res.status(500).json({ success: false, message: 'Không thể tải chi tiết phòng.' });
  }
}

async function createRoom(req, res) {
  const body = req.body || {};
  const { roomNumber, error: roomNumberError } = validateRoomNumber(body.room_number);
  const roomTypeId = Number(body.room_type_id);
  const { floor, error: floorError } = validateFloor(body.floor);

  if (roomNumberError) {
    return res.status(400).json({ success: false, message: roomNumberError });
  }
  if (!Number.isInteger(roomTypeId) || roomTypeId < 1) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn loại phòng hợp lệ.' });
  }
  if (floorError) {
    return res.status(400).json({ success: false, message: floorError });
  }

  try {
    const result = await saveRoom({ roomNumber, roomTypeId, floor });
    if (result.reason === 'ROOM_TYPE_NOT_FOUND') {
      return res.status(404).json({ message: 'Loại phòng đã chọn không còn khả dụng.' });
    }
    if (result.reason === 'ROOM_NUMBER_EXISTS') {
      return res.status(409).json({ success: false, message: 'Số phòng đã tồn tại.' });
    }
    return res.status(201).json({
      success: true,
      message: 'Thêm phòng thành công.',
      room: result.room,
    });
  } catch (error) {
    if (error.number === 2601 || error.number === 2627) {
      return res.status(409).json({ success: false, message: 'Số phòng đã tồn tại.' });
    }
    if (error.number === 547) {
      return res.status(404).json({ success: false, message: 'Loại phòng đã chọn không còn khả dụng.' });
    }
    console.error('Create room error:', error);
    return res.status(500).json({ message: 'Không thể thêm phòng.' });
  }
}

async function updateRoom(req, res) {
  const roomId = Number(req.params.roomId);
  const body = req.body || {};
  const { roomNumber, error: roomNumberError } = validateRoomNumber(body.room_number);
  const roomTypeId = Number(body.room_type_id);
  const { floor, error: floorError } = validateFloor(body.floor);

  if (!Number.isInteger(roomId) || roomId < 1) {
    return res.status(400).json({ success: false, message: 'Mã phòng không hợp lệ.' });
  }
  if (roomNumberError) {
    return res.status(400).json({ success: false, message: roomNumberError });
  }
  if (!Number.isInteger(roomTypeId) || roomTypeId < 1) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn loại phòng hợp lệ.' });
  }
  if (floorError) {
    return res.status(400).json({ success: false, message: floorError });
  }

  try {
    const result = await updateExistingRoom({ roomId, roomNumber, roomTypeId, floor });

    if (result.reason === 'ROOM_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Phòng không còn tồn tại hoặc không thể tìm thấy.' });
    }
    if (result.reason === 'ROOM_TYPE_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Loại phòng đã chọn không còn khả dụng.' });
    }
    if (result.reason === 'ROOM_NUMBER_EXISTS') {
      return res.status(409).json({ success: false, message: 'Số phòng đã tồn tại.' });
    }

    return res.json({
      success: true,
      message: 'Cập nhật phòng thành công.',
      room: result.room,
    });
  } catch (error) {
    if (error.number === 2601 || error.number === 2627) {
      return res.status(409).json({ success: false, message: 'Số phòng đã tồn tại.' });
    }
    if (error.number === 547) {
      return res.status(404).json({ success: false, message: 'Loại phòng đã chọn không còn khả dụng.' });
    }
    console.error('Update room error:', error);
    return res.status(500).json({ success: false, message: 'Không thể cập nhật phòng.' });
  }
}

/**
 * API GET /api/rooms/availability
 * Kiểm tra danh sách loại phòng và tình trạng phòng trống theo ngày
 * Query params:
 *   - check_in_date: ngày nhận phòng (mặc định: hôm nay)
 *   - check_out_date: ngày trả phòng (mặc định: ngày mai)
 *   - adults: số người lớn (mặc định: 1)
 *   - children: số trẻ em (mặc định: 0)
 */
async function checkAvailability(req, res) {
  try {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    const checkInDate = req.query.check_in_date || formatDate(today);
    const checkOutDate = req.query.check_out_date || formatDate(tomorrow);
    const adults = Math.max(1, parseInt(req.query.adults, 10) || 1);
    const children = Math.max(0, parseInt(req.query.children, 10) || 0);

    // Kiểm tra hợp lệ ngày
    const inDate = new Date(checkInDate);
    const outDate = new Date(checkOutDate);

    if (isNaN(inDate.getTime()) || isNaN(outDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Định dạng ngày nhận hoặc ngày trả phòng không hợp lệ (cần YYYY-MM-DD).',
      });
    }

    if (outDate <= inDate) {
      return res.status(400).json({
        success: false,
        message: 'Ngày trả phòng phải sau ngày nhận phòng.',
      });
    }

    // Gọi DAO để tính toán số phòng trống thực tế trong CSDL SQL Server
    const availabilityList = await checkRoomAvailability({
      checkInDate,
      checkOutDate,
      adults,
      children,
    });

    return res.json({
      success: true,
      check_in_date: checkInDate,
      check_out_date: checkOutDate,
      adults,
      children,
      total_types: availabilityList.length,
      available_types: availabilityList.filter((item) => item.is_available).length,
      data: availabilityList,
    });
  } catch (error) {
    console.error('Check room availability error:', error);
    return res.status(500).json({
      success: false,
      message: 'Không thể kiểm tra tình trạng phòng trống.',
      error: error.message,
    });
  }
}

/**
 * API GET /api/rooms/available-list
 * Lấy danh sách các số phòng vật lý còn trống cho một loại phòng cụ thể
 * Query params:
 *   - room_type_id: ID loại phòng (bắt buộc)
 *   - check_in_date: ngày nhận phòng (bắt buộc)
 *   - check_out_date: ngày trả phòng (bắt buộc)
 */
async function getAvailableRooms(req, res) {
  try {
    const { room_type_id, check_in_date, check_out_date } = req.query;

    if (!room_type_id || !check_in_date || !check_out_date) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin room_type_id, check_in_date hoặc check_out_date.',
      });
    }

    const rooms = await getAvailableRoomsForType({
      roomTypeId: Number(room_type_id),
      checkInDate: check_in_date,
      checkOutDate: check_out_date,
    });

    return res.json({
      success: true,
      room_type_id: Number(room_type_id),
      count: rooms.length,
      rooms,
    });
  } catch (error) {
    console.error('Get available rooms list error:', error);
    return res.status(500).json({
      success: false,
      message: 'Không thể lấy danh sách phòng trống.',
      error: error.message,
    });
  }
}

module.exports = {
  validateRoomNumber,
  validateFloor,
  getRoomList,
  getRoomDetails,
  createRoom,
  updateRoom,
  checkAvailability,
  getAvailableRooms,
};
