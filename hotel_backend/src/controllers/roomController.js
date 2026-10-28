const { checkRoomAvailability, createRoom: saveRoom, updateRoom: updateExistingRoom, deleteRoom: deleteExistingRoom, getAvailableRoomsForType, getRoomList: fetchRoomList, getRoomDetails: fetchRoomDetails, RoomInputError } = require('../services/roomService');

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
  try {
    const result = await saveRoom(req.body || {});
    if (result.reason === 'ROOM_TYPE_NOT_FOUND') {
      return res.status(404).json({ message: 'Lo\u1ea1i ph\u00f2ng \u0111\u00e3 ch\u1ecdn kh\u00f4ng c\u00f2n kh\u1ea3 d\u1ee5ng.' });
    }
    if (result.reason === 'ROOM_NUMBER_EXISTS') {
      return res.status(409).json({ success: false, message: 'S\u1ed1 ph\u00f2ng \u0111\u00e3 t\u1ed3n t\u1ea1i.' });
    }
    return res.status(201).json({ success: true, message: 'Th\u00eam ph\u00f2ng th\u00e0nh c\u00f4ng.', room: result.room });
  } catch (error) {
    if (error instanceof RoomInputError) return res.status(400).json({ success: false, message: error.message });
    if (error.number === 2601 || error.number === 2627) {
      return res.status(409).json({ success: false, message: 'S\u1ed1 ph\u00f2ng \u0111\u00e3 t\u1ed3n t\u1ea1i.' });
    }
    if (error.number === 547) {
      return res.status(404).json({ success: false, message: 'Lo\u1ea1i ph\u00f2ng \u0111\u00e3 ch\u1ecdn kh\u00f4ng c\u00f2n kh\u1ea3 d\u1ee5ng.' });
    }
    console.error('Create room error:', error);
    return res.status(500).json({ message: 'Kh\u00f4ng th\u1ec3 th\u00eam ph\u00f2ng.' });
  }
}

async function updateRoom(req, res) {
  try {
    const result = await updateExistingRoom(req.params.roomId, req.body || {});
    if (result.reason === 'ROOM_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Ph\u00f2ng kh\u00f4ng c\u00f2n t\u1ed3n t\u1ea1i ho\u1eb7c kh\u00f4ng th\u1ec3 t\u00ecm th\u1ea5y.' });
    }
    if (result.reason === 'ROOM_TYPE_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Lo\u1ea1i ph\u00f2ng \u0111\u00e3 ch\u1ecdn kh\u00f4ng c\u00f2n kh\u1ea3 d\u1ee5ng.' });
    }
    if (result.reason === 'ROOM_NUMBER_EXISTS') {
      return res.status(409).json({ success: false, message: 'S\u1ed1 ph\u00f2ng \u0111\u00e3 t\u1ed3n t\u1ea1i.' });
    }
    return res.json({ success: true, message: 'C\u1eadp nh\u1eadt ph\u00f2ng th\u00e0nh c\u00f4ng.', room: result.room });
  } catch (error) {
    if (error instanceof RoomInputError) return res.status(400).json({ success: false, message: error.message });
    if (error.number === 2601 || error.number === 2627) {
      return res.status(409).json({ success: false, message: 'S\u1ed1 ph\u00f2ng \u0111\u00e3 t\u1ed3n t\u1ea1i.' });
    }
    if (error.number === 547) {
      return res.status(404).json({ success: false, message: 'Lo\u1ea1i ph\u00f2ng \u0111\u00e3 ch\u1ecdn kh\u00f4ng c\u00f2n kh\u1ea3 d\u1ee5ng.' });
    }
    console.error('Update room error:', error);
    return res.status(500).json({ success: false, message: 'Kh\u00f4ng th\u1ec3 c\u1eadp nh\u1eadt ph\u00f2ng.' });
  }
}

async function deleteRoom(req, res) {
  const roomId = Number(req.params.roomId);
  if (!Number.isInteger(roomId) || roomId < 1) {
    return res.status(400).json({ success: false, message: 'Mã phòng không hợp lệ.' });
  }

  try {
    const result = await deleteExistingRoom(roomId);
    if (result.reason === 'ROOM_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Không tìm thấy phòng cần xóa.' });
    }
    if (result.reason === 'ROOM_REFERENCED') {
      return res.status(409).json({
        success: false,
        message: 'Không thể xóa phòng vì phòng đang được booking hoặc báo cáo bảo trì tham chiếu.',
      });
    }
    return res.json({ success: true, message: 'Đã xóa phòng thành công.' });
  } catch (error) {
    if (error.number === 547) {
      return res.status(409).json({
        success: false,
        message: 'Không thể xóa phòng vì phòng đang được dữ liệu khác sử dụng.',
      });
    }
    console.error('Delete room error:', error);
    return res.status(500).json({ success: false, message: 'Không thể xóa phòng.' });
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
    const excludeBookingId = req.query.exclude_booking_id == null ? null : Number(req.query.exclude_booking_id);
    if (excludeBookingId !== null && (!Number.isSafeInteger(excludeBookingId) || excludeBookingId < 1)) {
      return res.status(400).json({ success: false, message: 'Mã booking cần loại trừ không hợp lệ.' });
    }

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
      excludeBookingId,
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
  getRoomList,
  getRoomDetails,
  createRoom,
  updateRoom,
  deleteRoom,
  checkAvailability,
  getAvailableRooms,
};
