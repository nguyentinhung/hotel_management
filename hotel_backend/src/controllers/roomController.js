const { checkRoomAvailability, getAvailableRoomsForType } = require('../dao/roomDao');

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
  checkAvailability,
  getAvailableRooms,
};
