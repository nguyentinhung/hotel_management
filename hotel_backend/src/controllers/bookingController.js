const jwt = require('jsonwebtoken');
const { createWalkInBooking, createCustomerBooking, checkInBooking, getRecentBookings, getActiveBookings, checkOutBooking, updateRoomStatus, getRoomStatuses, getAssignableRooms, assignRoomToBooking } = require('../dao/bookingDao');
const JWT_SECRET = process.env.JWT_SECRET || 'hotel-management-secret';

async function createCustomerBookingHandler(req, res) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập để đặt phòng.' });

  let claims;
  try {
    claims = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
  }

  if (Number(claims.role_id) !== 1 || !claims.user_id) {
    return res.status(403).json({ success: false, message: 'Chỉ tài khoản khách hàng mới có thể đặt phòng trực tuyến.' });
  }

  const { room_type_id, check_in_date, check_out_date, adults, children = 0, special_request = '' } = req.body || {};
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!Number.isInteger(Number(room_type_id)) || Number(room_type_id) < 1) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn loại phòng hợp lệ.' });
  }
  if (!datePattern.test(check_in_date || '') || !datePattern.test(check_out_date || '')) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn ngày nhận và trả phòng hợp lệ.' });
  }
  const isRealDate = (value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  if (!isRealDate(check_in_date) || !isRealDate(check_out_date)) {
    return res.status(400).json({ success: false, message: 'Ngày đã chọn không hợp lệ.' });
  }
  const today = new Date().toISOString().slice(0, 10);
  if (check_in_date < today || check_out_date <= check_in_date) {
    return res.status(400).json({ success: false, message: 'Ngày nhận phòng không thể ở quá khứ và ngày trả phải sau ngày nhận.' });
  }
  if (!Number.isInteger(Number(adults)) || Number(adults) < 1 || Number(adults) > 20 ||
    !Number.isInteger(Number(children)) || Number(children) < 0 || Number(children) > 20) {
    return res.status(400).json({ success: false, message: 'Số lượng khách không hợp lệ.' });
  }
  if (String(special_request).length > 500) {
    return res.status(400).json({ success: false, message: 'Yêu cầu thêm không được vượt quá 500 ký tự.' });
  }

  try {
    const booking = await createCustomerBooking({
      customerId: claims.user_id,
      roomTypeId: Number(room_type_id),
      checkInDate: check_in_date,
      checkOutDate: check_out_date,
      adults: Number(adults),
      children: Number(children),
      specialRequest: special_request,
    });
    return res.status(201).json({ success: true, message: 'Đặt phòng thành công.', booking });
  } catch (error) {
    console.error('Create customer booking error:', error);
    const status = /no rooms are available/i.test(error.message)
      ? 409
      : /customer account is unavailable/i.test(error.message)
        ? 403
        : /room type was not found/i.test(error.message)
          ? 404
          : /guest count exceeds/i.test(error.message)
            ? 400
            : 500;
    const message = /no rooms are available/i.test(error.message)
      ? 'Phòng đã hết trong khoảng ngày đã chọn. Vui lòng chọn ngày hoặc loại phòng khác.'
      : /customer account is unavailable/i.test(error.message)
        ? 'Tài khoản khách hàng không còn hoạt động.'
        : /room type was not found/i.test(error.message)
          ? 'Không tìm thấy loại phòng đã chọn.'
          : /guest count exceeds/i.test(error.message)
            ? 'Số lượng khách vượt quá sức chứa của loại phòng này.'
            : 'Không thể tạo đặt phòng lúc này. Vui lòng thử lại.';
    return res.status(status).json({ success: false, message });
  }
}

async function checkInBookingHandler(req, res) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập để xác nhận check-in.' });

  let claims;
  try {
    claims = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
  }
  if (![2, 4].includes(Number(claims.role_id))) {
    return res.status(403).json({ success: false, message: 'Chỉ lễ tân hoặc quản trị viên mới được xác nhận check-in.' });
  }

  const idCardNumber = String(req.body?.id_card_number || '').trim();
  if (!/^[A-Za-z0-9-]{5,50}$/.test(idCardNumber)) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập số CCCD/CMND hoặc hộ chiếu hợp lệ.' });
  }

  try {
    const result = await checkInBooking({ bookingId: req.params.bookingId, idCardNumber });
    return res.json({ success: true, message: 'Đã lưu thông tin giấy tờ và xác nhận check-in.', booking: result });
  } catch (error) {
    const status = /not found/i.test(error.message)
      ? 404
      : /not waiting for check-in|outside its check-in dates|assign a room|not ready for check-in/i.test(error.message)
        ? 409
        : 500;
    const message = /not found/i.test(error.message)
      ? 'Không tìm thấy booking cần check-in.'
      : /not waiting for check-in/i.test(error.message)
        ? 'Booking này không ở trạng thái chờ check-in.'
        : /outside its check-in dates/i.test(error.message)
          ? 'Chỉ có thể check-in trong khoảng ngày lưu trú của booking.'
          : /assign a room/i.test(error.message)
            ? 'Cần gán phòng trước khi check-in.'
            : /not ready for check-in/i.test(error.message)
              ? 'Phòng đã gán hiện chưa sẵn sàng. Vui lòng chọn phòng khác hoặc xử lý trạng thái phòng trước.'
              : 'Không thể cập nhật check-in lúc này. Vui lòng thử lại.';
    return res.status(status).json({ success: false, message });
  }
}

/**
 * ============================================================================
 * CONTROLLER: ĐẶT PHÒNG TẠI QUẦY (WALK-IN BOOKING) DÀNH CHO LỄ TÂN
 * ============================================================================
 * Lễ tân tiếp nhận khách tới trực tiếp quầy (Walk-in guest), kiểm tra loại phòng
 * còn trống và tiến hành tạo đơn đặt phòng hoặc check-in ngay cho khách.
 */

/**
 * API POST /api/bookings/walk-in
 * Tạo đơn đặt phòng trực tiếp tại quầy
 */
async function createWalkInBookingHandler(req, res) {
  try {
    const {
      room_type_id,
      room_id,
      check_in_date,
      check_out_date,
      adults,
      children,
      guest_full_name,
      guest_phone,
      guest_email,
      guest_id_card,
      deposit_amount,
      special_request,
      check_in_now,
    } = req.body || {};

    // 1. Kiểm tra các trường bắt buộc
    if (!room_type_id) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn loại phòng.' });
    }
    if (!check_in_date || !check_out_date) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn ngày nhận và trả phòng.' });
    }
    if (!guest_full_name || !guest_full_name.trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập họ tên khách hàng.' });
    }
    if (!guest_phone || !guest_phone.trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập số điện thoại khách hàng.' });
    }
    const normalizedIdCard = String(guest_id_card || '').trim();
    if (check_in_now && !/^[A-Za-z0-9-]{5,50}$/.test(normalizedIdCard)) {
      return res.status(400).json({ success: false, message: 'Cần nhập CCCD/CMND hoặc hộ chiếu hợp lệ để check-in.' });
    }

    const inDate = new Date(check_in_date);
    const outDate = new Date(check_out_date);
    if (outDate <= inDate) {
      return res.status(400).json({ success: false, message: 'Ngày trả phòng phải sau ngày nhận phòng.' });
    }

    // 2. Tiến hành đặt phòng thông qua DAO
    const result = await createWalkInBooking({
      roomTypeId: Number(room_type_id),
      roomId: room_id ? Number(room_id) : null,
      checkInDate: check_in_date,
      checkOutDate: check_out_date,
      adults: Number(adults || 1),
      children: Number(children || 0),
      guestFullName: guest_full_name,
      guestPhone: guest_phone,
      guestEmail: guest_email,
      guestIdCard: normalizedIdCard,
      depositAmount: Number(deposit_amount || 0),
      specialRequest: special_request,
      checkInNow: Boolean(check_in_now),
    });

    return res.status(201).json({
      success: true,
      message: result.status === 'CHECKED_IN'
        ? `Đặt phòng và check-in thành công cho khách! Mã đặt: ${result.booking_code}`
        : `Đặt phòng tại quầy thành công! Mã đặt: ${result.booking_code}`,
      booking: result,
    });
  } catch (error) {
    console.error('Create walk-in booking error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Không thể tạo đơn đặt phòng tại quầy.',
    });
  }
}

/**
 * API GET /api/bookings/recent
 * Lấy danh sách booking mới nhất để hiển thị trên dashboard lễ tân
 */
async function getRecentBookingsHandler(req, res) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập để xem danh sách đặt phòng.' });

  let claims;
  try {
    claims = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
  }
  if (![2, 4].includes(Number(claims.role_id))) {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền xem danh sách đặt phòng.' });
  }

  try {
    const limit = parseInt(req.query.limit, 10) || 10;
    const bookings = await getRecentBookings(limit);

    return res.json({
      success: true,
      count: bookings.length,
      bookings,
    });
  } catch (error) {
    console.error('Get recent bookings error:', error);
    return res.status(500).json({
      success: false,
      message: 'Không thể lấy danh sách đặt phòng gần đây.',
      error: error.message,
    });
  }
}

async function getBookingHistoryHandler(req, res) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  let claims;
  try { claims = jwt.verify(token, JWT_SECRET); } catch {
    return res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn.' });
  }
  if (![2, 4].includes(Number(claims.role_id))) return res.status(403).json({ success: false, message: 'Bạn không có quyền xem lịch sử booking.' });
  try {
    const bookings = await getRecentBookings(null);
    return res.json({ success: true, count: bookings.length, bookings });
  } catch (error) {
    console.error('Get booking history error:', error);
    return res.status(500).json({ success: false, message: 'Không thể tải lịch sử booking.' });
  }
}

async function getActiveBookingsHandler(req, res) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  let claims;
  try { claims = jwt.verify(token, JWT_SECRET); } catch {
    return res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn.' });
  }
  if (![2, 4].includes(Number(claims.role_id))) return res.status(403).json({ success: false, message: 'Bạn không có quyền xem booking đang hoạt động.' });
  try {
    const bookings = await getActiveBookings();
    return res.json({ success: true, count: bookings.length, bookings });
  } catch (error) {
    console.error('Get active bookings error:', error);
    return res.status(500).json({ success: false, message: 'Không thể tải booking đang hoạt động.' });
  }
}

async function checkOutBookingHandler(req, res) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  let claims;
  try { claims = jwt.verify(token, JWT_SECRET); } catch {
    return res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn.' });
  }
  if (![2, 4].includes(Number(claims.role_id))) return res.status(403).json({ success: false, message: 'Chỉ lễ tân hoặc quản trị viên mới được check-out.' });
  try {
    const result = await checkOutBooking(req.params.bookingId);
    return res.json({ success: true, message: 'Đã check-out. Phòng chuyển sang trạng thái đang dọn.', booking: result });
  } catch (error) {
    const notFound = /not found/i.test(error.message);
    return res.status(notFound ? 404 : 409).json({ success: false, message: notFound ? 'Không tìm thấy booking.' : 'Booking này chưa check-in hoặc không thể check-out.' });
  }
}

async function finishRoomCleaningHandler(req, res) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  let claims;
  try { claims = jwt.verify(token, JWT_SECRET); } catch {
    return res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn.' });
  }
  if (![3, 4].includes(Number(claims.role_id))) return res.status(403).json({ success: false, message: 'Chỉ nhân viên buồng phòng hoặc quản trị viên mới được cập nhật trạng thái phòng.' });
  try {
    const targetStatus = String(req.body?.status || 'AVAILABLE').toUpperCase();
    const currentStatus = String(req.body?.current_status || 'CLEANING').toUpperCase();
    const validTransition = (currentStatus === 'CLEANING' && ['AVAILABLE', 'MAINTENANCE'].includes(targetStatus))
      || (Number(claims.role_id) === 4 && currentStatus === 'AVAILABLE' && targetStatus === 'MAINTENANCE')
      || (Number(claims.role_id) === 4 && currentStatus === 'MAINTENANCE' && targetStatus === 'AVAILABLE');
    if (!validTransition) return res.status(400).json({ success: false, message: 'Chuyển trạng thái phòng không hợp lệ.' });
    if (currentStatus === 'MAINTENANCE' && Number(claims.role_id) !== 4) return res.status(403).json({ success: false, message: 'Chỉ quản trị viên được xác nhận hoàn tất bảo trì.' });
    const room = await updateRoomStatus(req.params.roomId, targetStatus, currentStatus);
    return res.json({ success: true, message: targetStatus === 'MAINTENANCE' ? 'Đã chuyển phòng sang trạng thái bảo trì.' : currentStatus === 'CLEANING' ? 'Đã hoàn tất dọn phòng. Phòng sẵn sàng cho thuê.' : 'Đã hoàn tất bảo trì. Phòng sẵn sàng cho thuê.', room });
  } catch {
    return res.status(409).json({ success: false, message: 'Phòng không ở trạng thái đang dọn.' });
  }
}

async function getRoomStatusesHandler(req, res) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  let claims;
  try { claims = jwt.verify(token, JWT_SECRET); } catch {
    return res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn.' });
  }
  if (![2, 3, 4].includes(Number(claims.role_id))) return res.status(403).json({ success: false, message: 'Bạn không có quyền xem danh sách phòng.' });
  try { return res.json({ success: true, rooms: await getRoomStatuses() }); }
  catch (error) { return res.status(500).json({ success: false, message: 'Không thể tải trạng thái phòng.', error: error.message }); }
}

async function getAssignableRoomsHandler(req, res) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  let claims;
  try { claims = jwt.verify(token, JWT_SECRET); } catch {
    return res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn.' });
  }
  if (![2, 4].includes(Number(claims.role_id))) return res.status(403).json({ success: false, message: 'Chỉ lễ tân hoặc admin được xem phòng có thể gán.' });
  try { return res.json({ success: true, ...(await getAssignableRooms(req.params.bookingId)) }); }
  catch (error) {
    const notFound = /not found/i.test(error.message);
    return res.status(notFound ? 404 : 409).json({ success: false, message: notFound ? 'Không tìm thấy booking.' : 'Booking không chờ gán phòng.' });
  }
}

async function assignRoomHandler(req, res) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  let claims;
  try { claims = jwt.verify(token, JWT_SECRET); } catch {
    return res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn.' });
  }
  if (![2, 4].includes(Number(claims.role_id))) return res.status(403).json({ success: false, message: 'Chỉ lễ tân hoặc admin được gán phòng.' });
  const roomId = Number(req.body?.room_id);
  if (!Number.isInteger(roomId) || roomId <= 0) return res.status(400).json({ success: false, message: 'Vui lòng chọn phòng hợp lệ.' });
  try {
    const assignment = await assignRoomToBooking({ bookingId: req.params.bookingId, roomId });
    return res.json({ success: true, message: 'Đã gán phòng cho booking.', assignment });
  } catch (error) {
    const notFound = /not found/i.test(error.message);
    const unavailable = /unavailable/i.test(error.message);
    return res.status(notFound ? 404 : 409).json({ success: false, message: notFound ? 'Không tìm thấy booking.' : unavailable ? 'Phòng vừa được gán hoặc không phù hợp với ngày lưu trú.' : 'Booking đã có phòng hoặc không chờ gán phòng.' });
  }
}

module.exports = {
  createCustomerBookingHandler,
  checkInBookingHandler,
  createWalkInBookingHandler,
  getRecentBookingsHandler,
  getBookingHistoryHandler,
  getActiveBookingsHandler,
  checkOutBookingHandler,
  finishRoomCleaningHandler,
  getRoomStatusesHandler,
  getAssignableRoomsHandler,
  assignRoomHandler,
};
