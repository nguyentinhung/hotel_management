const jwt = require('jsonwebtoken');
const { createWalkInBooking, createCustomerBooking, checkInBooking, getRecentBookings, getActiveBookings, updateBooking, cancelBooking, checkOutBooking, updateRoomStatus, reportRoomMaintenance, getOpenRoomMaintenanceReports, resolveRoomMaintenanceReport, getRoomStatuses, getAssignableRooms, assignRoomToBooking } = require('../dao/bookingDao');
const { makeReceptionCheckoutPayment } = require('../services/paymentService');
const JWT_SECRET = process.env.JWT_SECRET || 'hotel-management-secret';
const roleCodeById = { 1: 'CUSTOMER', 2: 'RECEPTIONIST', 3: 'HOUSEKEEPER', 4: 'ADMIN' };
const hasRole = (claims, ...roles) => {
  const roleCode = roleCodeById[Number(claims.role_id)] || String(claims.role_code || '').toUpperCase();
  return roles.includes(roleCode);
};
const isCustomerClaims = (claims) => hasRole(claims, 'CUSTOMER');

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

  if (!isCustomerClaims(claims) || !claims.user_id) {
    return res.status(403).json({ success: false, message: 'Chỉ tài khoản khách hàng mới có thể đặt phòng trực tuyến.' });
  }

  const { room_type_id, room_selections, service_selections, check_in_date, check_out_date, adults, children = 0, special_request = '' } = req.body || {};
  const selections = Array.isArray(room_selections) && room_selections.length
    ? room_selections
    : [{ room_type_id, quantity: 1 }];
  const services = Array.isArray(service_selections) ? service_selections : [];
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (selections.length > 10 || selections.some((selection) => !Number.isInteger(Number(selection.room_type_id)) || Number(selection.room_type_id) < 1 || !Number.isInteger(Number(selection.quantity)) || Number(selection.quantity) < 1 || Number(selection.quantity) > 10) || new Set(selections.map((selection) => Number(selection.room_type_id))).size !== selections.length) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn loại phòng hợp lệ.' });
  }
  if (services.length > 20 || services.some((selection) => !Number.isInteger(Number(selection.service_id)) || Number(selection.service_id) < 1 || !Number.isInteger(Number(selection.quantity)) || Number(selection.quantity) < 1 || Number(selection.quantity) > 20)) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn dịch vụ và số lượng hợp lệ.' });
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
      roomSelections: selections.map((selection) => ({ roomTypeId: Number(selection.room_type_id), quantity: Number(selection.quantity) })),
      serviceSelections: services.map((selection) => ({ serviceId: Number(selection.service_id), quantity: Number(selection.quantity) })),
      checkInDate: check_in_date,
      checkOutDate: check_out_date,
      adults: Number(adults),
      children: Number(children),
      specialRequest: special_request,
    });
    return res.status(201).json({ success: true, message: 'Đặt phòng thành công.', booking });
  } catch (error) {
    console.error('Create customer booking error:', error);
    const status = /no rooms are available|not enough rooms available/i.test(error.message)
      ? 409
      : /customer account is unavailable/i.test(error.message)
        ? 403
        : /room type was not found/i.test(error.message)
          ? 404
          : /guest count exceeds/i.test(error.message)
            ? 400
            : 500;
    const message = /no rooms are available|not enough rooms available/i.test(error.message)
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
  if (!hasRole(claims, 'RECEPTIONIST', 'ADMIN')) {
    return res.status(403).json({ success: false, message: 'Chỉ lễ tân hoặc quản trị viên mới được xác nhận check-in.' });
  }

  const idCardNumber = String(req.body?.id_card_number || '').trim();
  if (!/^[A-Za-z0-9-]{5,50}$/.test(idCardNumber)) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập số CCCD/CMND hoặc hộ chiếu hợp lệ.' });
  }

  try {
    const result = await checkInBooking({ bookingId: req.params.bookingId, idCardNumber });
    if (result.auto_cancelled) {
      return res.status(409).json({ success: false, message: 'Đã quá 18:00 ngày nhận phòng. Booking đã tự động hủy, không thể check-in.', booking: result });
    }
    return res.json({ success: true, message: 'Đã lưu thông tin giấy tờ và xác nhận check-in.', booking: result });
  } catch (error) {
    const status = /not found/i.test(error.message)
      ? 404
      : /not waiting for check-in|outside its check-in dates|assign a room|not ready for check-in|deposit payment is required/i.test(error.message)
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
            : /deposit payment is required/i.test(error.message)
              ? 'Booking online chưa thanh toán đủ tiền cọc tối thiểu 30%, không thể check-in.'
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
      room_selections,
      check_in_date,
      check_out_date,
      adults,
      children,
      guest_full_name,
      guest_phone,
      guest_email,
      guest_id_card,
      deposit_amount,
      service_selections,
      special_request,
      check_in_now,
    } = req.body || {};

    // 1. Kiểm tra các trường bắt buộc
    const selections = Array.isArray(room_selections) && room_selections.length
      ? room_selections
      : [{ room_type_id, room_id }];
    const services = Array.isArray(service_selections) ? service_selections : [];
    if (services.length > 20 || services.some((selection) => !Number.isInteger(Number(selection.service_id)) || Number(selection.service_id) < 1 || !Number.isInteger(Number(selection.quantity)) || Number(selection.quantity) < 1 || Number(selection.quantity) > 20)) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn dịch vụ và số lượng hợp lệ.' });
    }
    if (selections.length > 10 || selections.some((selection) => !Number.isInteger(Number(selection.room_type_id)) || Number(selection.room_type_id) < 1 || (selection.room_id != null && selection.room_id !== '' && !Number.isInteger(Number(selection.room_id))))) {
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
      roomSelections: selections.map((selection) => ({ roomTypeId: Number(selection.room_type_id), roomId: selection.room_id ? Number(selection.room_id) : null })),
      checkInDate: check_in_date,
      checkOutDate: check_out_date,
      adults: Number(adults || 1),
      children: Number(children || 0),
      guestFullName: guest_full_name,
      guestPhone: guest_phone,
      guestEmail: guest_email,
      guestIdCard: normalizedIdCard,
      depositAmount: Number(deposit_amount || 0),
      serviceSelections: services.map((selection) => ({ serviceId: Number(selection.service_id), quantity: Number(selection.quantity) })),
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
  if (!hasRole(claims, 'RECEPTIONIST', 'ADMIN')) {
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
  if (!isCustomerClaims(claims) && !hasRole(claims, 'RECEPTIONIST', 'ADMIN')) return res.status(403).json({ success: false, message: 'Bạn không có quyền xem lịch sử booking.' });
  try {
    if (isCustomerClaims(claims) && !claims.user_id) return res.status(403).json({ success: false, message: 'Không xác định được tài khoản khách hàng.' });
    const customerId = isCustomerClaims(claims) ? claims.user_id : null;
    const bookings = await getRecentBookings(null, false, customerId);
    return res.json({ success: true, count: bookings.length, bookings });
  } catch (error) {
    console.error('Get booking history error:', error);
    return res.status(500).json({ success: false, message: 'Không thể tải lịch sử booking.' });
  }
}

async function updateBookingHandler(req, res) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  let claims;
  try { claims = jwt.verify(token, JWT_SECRET); } catch {
    return res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn.' });
  }
  const customer = isCustomerClaims(claims);
  if (!customer && !hasRole(claims, 'RECEPTIONIST', 'ADMIN')) return res.status(403).json({ success: false, message: 'Bạn không có quyền cập nhật booking.' });
  const { check_in_date, check_out_date, guest_full_name, guest_phone, guest_email, adults, children, special_request } = req.body || {};
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const isRealDate = (value) => {
    if (!datePattern.test(value || '')) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  if (!isRealDate(check_in_date) || !isRealDate(check_out_date) || !guest_full_name?.trim() || !guest_phone?.trim()) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ thông tin booking hợp lệ.' });
  }
  if (!Number.isInteger(Number(adults)) || Number(adults) < 1 || !Number.isInteger(Number(children)) || Number(children) < 0) {
    return res.status(400).json({ success: false, message: 'Sá»‘ lÆ°á»£ng khÃ¡ch khÃ´ng há»£p lá»‡.' });
  }
  if (String(special_request || '').length > 500) return res.status(400).json({ success: false, message: 'Yêu cầu thêm không được vượt quá 500 ký tự.' });
  try {
    const booking = await updateBooking({
      bookingId: req.params.bookingId,
      customerId: customer ? claims.user_id : null,
      checkInDate: check_in_date,
      checkOutDate: check_out_date,
      guestFullName: guest_full_name,
      guestPhone: guest_phone,
      guestEmail: guest_email,
      adults: Number(adults),
      children: Number(children),
      specialRequest: special_request,
    });
    return res.json({ success: true, message: 'Đã cập nhật booking.', booking });
  } catch (error) {
    const message = error.message;
    const status = /not found/i.test(message) ? 404 : /cannot be updated|capacity|available|check-in date/i.test(message) ? 409 : 400;
    return res.status(status).json({ success: false, message });
  }
}

async function cancelBookingHandler(req, res) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  let claims;
  try { claims = jwt.verify(token, JWT_SECRET); } catch {
    return res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn.' });
  }
  const customer = isCustomerClaims(claims);
  if (!customer && !hasRole(claims, 'RECEPTIONIST', 'ADMIN')) return res.status(403).json({ success: false, message: 'Bạn không có quyền hủy booking.' });
  try {
    const booking = await cancelBooking({ bookingId: req.params.bookingId, customerId: customer ? claims.user_id : null });
    return res.json({ success: true, message: 'Đã hủy booking.', booking });
  } catch (error) {
    return res.status(409).json({ success: false, message: error.message });
  }
}

async function getActiveBookingsHandler(req, res) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  let claims;
  try { claims = jwt.verify(token, JWT_SECRET); } catch {
    return res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn.' });
  }
  if (!hasRole(claims, 'RECEPTIONIST', 'ADMIN')) return res.status(403).json({ success: false, message: 'Bạn không có quyền xem booking đang hoạt động.' });
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
  if (!hasRole(claims, 'RECEPTIONIST', 'ADMIN')) return res.status(403).json({ success: false, message: 'Chỉ lễ tân hoặc quản trị viên mới được check-out.' });
  try {
    const result = await makeReceptionCheckoutPayment({
      bookingId: req.params.bookingId,
      method: req.body?.payment_method,
      ipAddress: req.ip,
    });
    return res.json({
      success: true,
      message: result.payment_url ? 'Đã tạo giao dịch. Chuyển đến VNPay để thanh toán.' : 'Đã checkout và ghi nhận thanh toán.',
      booking: { booking_id: req.params.bookingId, status: 'CHECKED_OUT' },
      ...result,
    });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
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
  if (!hasRole(claims, 'HOUSEKEEPER', 'ADMIN')) return res.status(403).json({ success: false, message: 'Chỉ nhân viên buồng phòng hoặc quản trị viên mới được cập nhật trạng thái phòng.' });
  try {
    const targetStatus = String(req.body?.status || 'AVAILABLE').toUpperCase();
    const currentStatus = String(req.body?.current_status || 'CLEANING').toUpperCase();
    const validTransition = (currentStatus === 'CLEANING' && ['AVAILABLE', 'MAINTENANCE'].includes(targetStatus))
      || (hasRole(claims, 'ADMIN') && currentStatus === 'AVAILABLE' && targetStatus === 'MAINTENANCE')
      || (hasRole(claims, 'ADMIN') && currentStatus === 'MAINTENANCE' && targetStatus === 'AVAILABLE');
    if (!validTransition) return res.status(400).json({ success: false, message: 'Chuyển trạng thái phòng không hợp lệ.' });
    if (currentStatus === 'MAINTENANCE' && !hasRole(claims, 'ADMIN')) return res.status(403).json({ success: false, message: 'Chỉ quản trị viên được xác nhận hoàn tất bảo trì.' });
    const room = await updateRoomStatus(req.params.roomId, targetStatus, currentStatus);
    const message = room.status === 'MAINTENANCE'
      ? targetStatus === 'MAINTENANCE'
        ? 'Đã chuyển phòng sang trạng thái bảo trì.'
        : 'Đã dọn xong nhưng phòng còn báo cáo bảo trì đang mở, nên vẫn được giữ ở trạng thái bảo trì.'
      : currentStatus === 'CLEANING'
        ? 'Đã hoàn tất dọn phòng. Phòng sẵn sàng cho thuê.'
        : 'Đã hoàn tất bảo trì. Phòng sẵn sàng cho thuê.';
    return res.json({ success: true, message, room });
  } catch {
    return res.status(409).json({ success: false, message: 'Phòng không ở trạng thái đang dọn.' });
  }
}

async function reportRoomMaintenanceHandler(req, res) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  let claims;
  try { claims = jwt.verify(token, JWT_SECRET); } catch {
    return res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn.' });
  }
  if (!hasRole(claims, 'HOUSEKEEPER', 'ADMIN')) return res.status(403).json({ success: false, message: 'Chỉ nhân viên buồng phòng hoặc quản trị viên mới được báo bảo trì.' });
  try {
    const report = await reportRoomMaintenance({
      roomId: req.params.roomId,
      reportedBy: claims.user_id,
      description: req.body?.description,
    });
    return res.json({ success: true, message: 'Đã gửi báo cáo bảo trì. Phòng vẫn ở danh sách cần dọn đến khi xác nhận dọn xong.', report });
  } catch (error) {
    const notFound = /not found/i.test(error.message);
    return res.status(notFound ? 404 : 409).json({ success: false, message: notFound ? 'Không tìm thấy phòng.' : 'Phòng không ở trạng thái đang dọn để báo bảo trì.' });
  }
}

async function getRoomMaintenanceReportsHandler(req, res) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  let claims;
  try { claims = jwt.verify(token, JWT_SECRET); } catch {
    return res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn.' });
  }
  if (!hasRole(claims, 'ADMIN')) return res.status(403).json({ success: false, message: 'Chỉ quản trị viên mới được xem báo cáo bảo trì.' });
  try {
    return res.json({ success: true, reports: await getOpenRoomMaintenanceReports() });
  } catch (error) {
    console.error('Get room maintenance reports error:', error);
    return res.status(500).json({ success: false, message: 'Không tải được báo cáo bảo trì.' });
  }
}

async function resolveRoomMaintenanceReportHandler(req, res) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  let claims;
  try { claims = jwt.verify(token, JWT_SECRET); } catch {
    return res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn.' });
  }
  if (!hasRole(claims, 'ADMIN')) return res.status(403).json({ success: false, message: 'Chỉ quản trị viên mới được đóng báo cáo bảo trì.' });
  try {
    await resolveRoomMaintenanceReport(req.params.reportId);
    return res.json({ success: true, message: 'Đã xác nhận bảo trì xong. Nếu phòng còn đang dọn, housekeeping vẫn cần xác nhận dọn xong.' });
  } catch {
    return res.status(404).json({ success: false, message: 'Không tìm thấy báo cáo đang mở.' });
  }
}

async function getRoomStatusesHandler(req, res) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  let claims;
  try { claims = jwt.verify(token, JWT_SECRET); } catch {
    return res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn.' });
  }
  if (!hasRole(claims, 'RECEPTIONIST', 'HOUSEKEEPER', 'ADMIN')) return res.status(403).json({ success: false, message: 'Bạn không có quyền xem danh sách phòng.' });
  try { return res.json({ success: true, rooms: await getRoomStatuses() }); }
  catch (error) { return res.status(500).json({ success: false, message: 'Không thể tải trạng thái phòng.', error: error.message }); }
}

async function getAssignableRoomsHandler(req, res) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  let claims;
  try { claims = jwt.verify(token, JWT_SECRET); } catch {
    return res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn.' });
  }
  if (!hasRole(claims, 'RECEPTIONIST', 'ADMIN')) return res.status(403).json({ success: false, message: 'Chỉ lễ tân hoặc admin được xem phòng có thể gán.' });
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
  if (!hasRole(claims, 'RECEPTIONIST', 'ADMIN')) return res.status(403).json({ success: false, message: 'Chỉ lễ tân hoặc admin được gán phòng.' });
  const roomAssignments = req.body?.room_assignments;
  if (!Array.isArray(roomAssignments) || !roomAssignments.length || roomAssignments.some((item) => !Number.isInteger(Number(item.booking_room_id)) || Number(item.booking_room_id) <= 0 || !Number.isInteger(Number(item.room_id)) || Number(item.room_id) <= 0)) return res.status(400).json({ success: false, message: 'Please assign a room to every booking room.' });
  try {
    const assignment = await assignRoomToBooking({ bookingId: req.params.bookingId, roomAssignments: roomAssignments.map((item) => ({ booking_room_id: Number(item.booking_room_id), room_id: Number(item.room_id) })) });
    return res.json({ success: true, message: 'Đã gán phòng cho booking.', assignment });
  } catch (error) {
    const notFound = /not found/i.test(error.message);
    const unavailable = /unavailable|duplicate|invalid booking room|every booking room/i.test(error.message);
    return res.status(notFound ? 404 : 409).json({ success: false, message: notFound ? 'Không tìm thấy booking.' : unavailable ? 'Phòng vừa được gán hoặc không phù hợp với ngày lưu trú.' : 'Booking đã có phòng hoặc không chờ gán phòng.' });
  }
}

module.exports = {
  createCustomerBookingHandler,
  checkInBookingHandler,
  createWalkInBookingHandler,
  getRecentBookingsHandler,
  getBookingHistoryHandler,
  updateBookingHandler,
  cancelBookingHandler,
  getActiveBookingsHandler,
  checkOutBookingHandler,
  finishRoomCleaningHandler,
  reportRoomMaintenanceHandler,
  getRoomMaintenanceReportsHandler,
  resolveRoomMaintenanceReportHandler,
  getRoomStatusesHandler,
  getAssignableRoomsHandler,
  assignRoomHandler,
};
