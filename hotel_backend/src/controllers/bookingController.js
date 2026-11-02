const jwt = require('jsonwebtoken');
const { createWalkInBooking, createCustomerBooking, checkInBooking, getRecentBookings, getBookingDetails, getStayExtensionBilling, getActiveBookings, getInHouseBookings, updateBooking, extendCheckedInBooking, extendBookingHold, cancelBooking, checkOutBooking, reportRoomMaintenance, getOpenRoomMaintenanceReports, resolveRoomMaintenanceReport, getRoomStatuses, getAssignableRooms, assignRoomToBooking } = require('../services/bookingService');
const { updateRoomStatus } = require('../services/roomService');

function isValidIdCardImage(file) {
  if (!file?.buffer?.length) return false;
  const bytes = file.buffer;
  if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (file.mimetype === 'image/png') {
    return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (file.mimetype === 'image/webp') {
    return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  }
  return false;
}
const { makeReceptionCheckoutPayment, createReceptionInvoice, syncReceptionBookingCompensations } = require('../services/paymentService');
const { jwtSecret: JWT_SECRET } = require('../config/auth');
const { getHotelDate } = require('../utils/hotelTime');
const { toCreateCustomerBookingRequest } = require('../dto/booking/create-booking-customer/create-booking-customer-request.dto');
const { toCreateCustomerBookingResponse } = require('../dto/booking/create-booking-customer/create-booking-customer-response.dto');
const { toCreateReceptionBookingRequest } = require('../dto/booking/create-booking-reception/create-booking-reception-request.dto');
const { toCreateReceptionBookingResponse } = require('../dto/booking/create-booking-reception/create-booking-reception-response.dto');
const { toUpdateBookingRequest } = require('../dto/booking/update-booking/update-booking-request.dto');
const { toUpdateBookingResponse } = require('../dto/booking/update-booking/update-booking-response.dto');
const { toCancelBookingRequest } = require('../dto/booking/cancel-booking/cancel-booking-request.dto');
const { toCancelBookingResponse } = require('../dto/booking/cancel-booking/cancel-booking-response.dto');
const { toCheckInRequest } = require('../dto/booking/check-in/check-in-request.dto');
const { toCheckInResponse } = require('../dto/booking/check-in/check-in-response.dto');
const { toCheckOutResponse } = require('../dto/booking/check-out/check-out-response.dto');
const { toExtendStayRequest } = require('../dto/booking/extend-stay/extend-stay-request.dto');
const { toExtendStayResponse } = require('../dto/booking/extend-stay/extend-stay-response.dto');
const { toExtendHoldRequest } = require('../dto/booking/extend-hold/extend-hold-request.dto');
const { toExtendHoldResponse } = require('../dto/booking/extend-hold/extend-hold-response.dto');
const { toAssignRoomRequest } = require('../dto/booking/assign-room/assign-room-request.dto');
const { toAssignRoomResponse } = require('../dto/booking/assign-room/assign-room-response.dto');
const { toCheckOutRequest } = require('../dto/booking/check-out/check-out-request.dto');
const { toCustomerBookingHistoryResponse } = require('../dto/booking/view-booking-history-customer/booking-history-customer-response.dto');
const { toReceptionBookingHistoryResponse } = require('../dto/booking/view-booking-history-reception/booking-history-reception-response.dto');
const { toRecentBookingsResponse } = require('../dto/booking/view-recent-bookings/recent-bookings-response.dto');
const { toInHouseBookingsResponse } = require('../dto/booking/view-in-house-bookings/in-house-bookings-response.dto');
const { toBookingDetailsResponse } = require('../dto/booking/view-booking-details/booking-details-response.dto');
const { toCreateReceptionBookingRequest: toWalkInBookingRequest } = require('../dto/booking/create-booking-reception/create-booking-reception-request.dto');
const { toUpdateRoomStatusRequest } = require('../dto/booking/update-room-status/update-room-status-request.dto');
const { toReportRoomMaintenanceRequest } = require('../dto/booking/report-room-maintenance/report-room-maintenance-request.dto');
const { toReportRoomMaintenanceResponse } = require('../dto/booking/report-room-maintenance/report-room-maintenance-response.dto');
const { toUpdateRoomStatusResponse } = require('../dto/booking/update-room-status/update-room-status-response.dto');
const { toSyncInvoiceCompensationsResponse } = require('../dto/booking/sync-invoice-compensations/sync-invoice-compensations-response.dto');
const roleCodeById = { 1: 'ADMIN', 2: 'RECEPTIONIST', 3: 'HOUSEKEEPER', 4: 'CUSTOMER' };
const hasRole = (claims, ...roles) => {
  const roleCode = String(claims.role_code || '').toUpperCase() || roleCodeById[Number(claims.role_id)];
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

  const { room_type_id, room_selections, service_selections, promotion_code, check_in_date, check_out_date, adults, children, special_request } = toCreateCustomerBookingRequest(req.body);
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
  const today = getHotelDate();
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
      promotionCode: promotion_code,
      checkInDate: check_in_date,
      checkOutDate: check_out_date,
      adults: Number(adults),
      children: Number(children),
      specialRequest: special_request,
    });
    return res.status(201).json(toCreateCustomerBookingResponse({ success: true, message: 'Đặt phòng thành công.', booking }));
  } catch (error) {
    console.error('Create customer booking error:', error);
    const status = /no rooms are available|not enough rooms available/i.test(error.message)
      ? 409
      : /customer account is unavailable/i.test(error.message)
        ? 403
        : /room type was not found/i.test(error.message)
          ? 404
          : /guest count exceeds|only prebook services|promotion code/i.test(error.message)
            ? 400
            : 500;
    const message = /no rooms are available|not enough rooms available/i.test(error.message)
      ? 'Phòng đã hết trong khoảng ngày đã chọn. Vui lòng chọn ngày hoặc loại phòng khác.'
      : /customer account is unavailable/i.test(error.message)
        ? 'Tài khoản khách hàng không còn hoạt động.'
        : /room type was not found/i.test(error.message)
          ? 'Không tìm thấy loại phòng đã chọn.'
          : /only prebook services/i.test(error.message)
            ? 'Chỉ có thể chọn dịch vụ được cấu hình cho phép đặt trước.'
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
  if (!hasRole(claims, 'RECEPTIONIST')) {
    return res.status(403).json({ success: false, message: 'Chỉ lễ tân mới được xác nhận check-in.' });
  }

  const { room_assignments: roomAssignmentsPayload } = toCheckInRequest(req.body);
  let roomAssignments;
  try {
    roomAssignments = JSON.parse(roomAssignmentsPayload || '[]');
  } catch {
    return res.status(400).json({ success: false, message: 'Invalid room assignments.' });
  }
  if (!Array.isArray(roomAssignments) || roomAssignments.some((item) =>
    !Number.isSafeInteger(Number(item?.booking_room_id)) || Number(item.booking_room_id) < 1
    || !Number.isSafeInteger(Number(item?.room_id)) || Number(item.room_id) < 1)) {
    return res.status(400).json({ success: false, message: 'Assign a valid room to every booking room.' });
  }

  const idCardFrontImage = req.idCardImages?.front;
  const idCardBackImage = req.idCardImages?.back;
  if ((idCardFrontImage && !isValidIdCardImage(idCardFrontImage)) || (idCardBackImage && !isValidIdCardImage(idCardBackImage))) {
    return res.status(400).json({ success: false, message: 'Ảnh CCCD không hợp lệ. Vui lòng chọn ảnh JPG, PNG hoặc WEBP.' });
  }

  try {
    const result = await checkInBooking({
      bookingId: req.params.bookingId,
      actorUserId: claims.user_id,
      roomAssignments: roomAssignments.map((item) => ({ booking_room_id: Number(item.booking_room_id), room_id: Number(item.room_id) })),
      idCardFrontImageBuffer: idCardFrontImage?.buffer || null,
      idCardFrontImageMimeType: idCardFrontImage?.mimetype || null,
      idCardBackImageBuffer: idCardBackImage?.buffer || null,
      idCardBackImageMimeType: idCardBackImage?.mimetype || null,
    });
    return res.json(toCheckInResponse({ success: true, message: 'Đã xác nhận check-in thành công.', booking: result }));
  } catch (error) {
    const status = /not found/i.test(error.message)
      ? 404
        : /not waiting for check-in|outside its check-in dates|assign a room|not ready for check-in|deposit payment is required|invalid room assignment|selected room is unavailable|staff profile was not found/i.test(error.message)
        ? 409
        : /CCCD images are required/i.test(error.message)
          ? 400
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
            : /staff profile was not found/i.test(error.message)
              ? 'Tài khoản lễ tân chưa có hồ sơ nhân viên trong bảng staff.'
            : /invalid room assignment|selected room is unavailable/i.test(error.message)
              ? 'Selected room is unavailable. Please choose another room.'
            : /CCCD images are required/i.test(error.message)
              ? 'Vui lòng tải đủ ảnh CCCD mặt trước và mặt sau trước khi check-in booking này.'
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
    let body = req.body || {};
    if (typeof body.payload === 'string') {
      try { body = JSON.parse(body.payload); } catch {
        return res.status(400).json({ success: false, message: 'Dữ liệu booking không hợp lệ.' });
      }
    }
    body = toWalkInBookingRequest(body);
    const idCardFrontImage = req.idCardImages?.front;
    const idCardBackImage = req.idCardImages?.back;
    if (!isValidIdCardImage(idCardFrontImage) || !isValidIdCardImage(idCardBackImage)) {
      return res.status(400).json({ success: false, message: 'Vui lòng tải đủ ảnh CCCD mặt trước và mặt sau hợp lệ (JPG, PNG hoặc WEBP, tối đa 5 MB mỗi ảnh).' });
    }
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
      promotion_code,
      special_request,
      check_in_now,
    } = toCreateReceptionBookingRequest(body);

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
    const normalizedPhone = String(guest_phone || '').trim();
    if (!/^\d{10}$/.test(normalizedPhone)) {
      return res.status(400).json({ success: false, message: 'Số điện thoại phải gồm đúng 10 chữ số.' });
    }
    const normalizedEmail = String(guest_email || '').trim();
    if (normalizedEmail && (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizedEmail))) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập email đúng định dạng, ví dụ khach@example.com.' });
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
      guestPhone: normalizedPhone,
      guestEmail: normalizedEmail || null,
      guestIdCard: String(guest_id_card || '').trim(),
      guestIdCardImage: idCardFrontImage.buffer,
      guestIdCardImageMimeType: idCardFrontImage.mimetype,
      guestIdCardBackImage: idCardBackImage.buffer,
      guestIdCardBackImageMimeType: idCardBackImage.mimetype,
      depositAmount: Number(deposit_amount || 0),
      serviceSelections: services.map((selection) => ({ serviceId: Number(selection.service_id), quantity: Number(selection.quantity) })),
      promotionCode: promotion_code,
      specialRequest: special_request,
      checkInNow: Boolean(check_in_now),
      createdByUserId: req.auth?.userId ?? null,
    });

    return res.status(201).json(toCreateReceptionBookingResponse({
      success: true,
      message: result.status === 'CHECKED_IN'
        ? `Đặt phòng và check-in thành công cho khách! Mã đặt: ${result.booking_code}`
        : `Đặt phòng tại quầy thành công! Mã đặt: ${result.booking_code}`,
      booking: result,
    }));
  } catch (error) {
    console.error('Create walk-in booking error:', error);
    const isInvalidServicePolicy = /only prebook services/i.test(error.message);
    const isInvalidPromotion = /promotion code is invalid/i.test(error.message);
    return res.status(isInvalidServicePolicy || isInvalidPromotion ? 400 : 500).json({
      success: false,
      message: isInvalidPromotion
        ? 'Promotion không hợp lệ, chưa hoạt động hoặc đã hết hạn.'
        : isInvalidServicePolicy
        ? 'Chỉ có thể chọn dịch vụ được cấu hình cho phép đặt trước.'
        : error.message || 'Không thể tạo đơn đặt phòng tại quầy.',
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
  if (!hasRole(claims, 'RECEPTIONIST')) {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền xem danh sách đặt phòng.' });
  }

  try {
    const limit = parseInt(req.query.limit, 10) || 10;
    const bookings = await getRecentBookings(limit);

    return res.json(toRecentBookingsResponse(bookings));
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
    return res.json(isCustomerClaims(claims)
      ? toCustomerBookingHistoryResponse(bookings)
      : toReceptionBookingHistoryResponse(bookings));
  } catch (error) {
    console.error('Get booking history error:', error);
    return res.status(500).json({ success: false, message: 'Không thể tải lịch sử booking.' });
  }
}

async function getInHouseBookingsHandler(req, res) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  let claims;
  try { claims = jwt.verify(token, JWT_SECRET); } catch {
    return res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn.' });
  }
  if (!hasRole(claims, 'RECEPTIONIST', 'ADMIN')) {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền xem booking đang lưu trú.' });
  }
  try {
    const bookings = await getInHouseBookings();
    return res.json(toInHouseBookingsResponse(bookings));
  } catch (error) {
    console.error('Get in-house bookings error:', error);
    return res.status(500).json({ success: false, message: 'Không thể tải danh sách booking đang lưu trú.' });
  }
}

async function getBookingDetailsHandler(req, res) {
  const bookingId = Number(req.params.bookingId);
  if (!Number.isSafeInteger(bookingId) || bookingId < 1) {
    return res.status(400).json({ success: false, message: 'MÃ£ booking khÃ´ng há»£p lá»‡.' });
  }

  try {
    const customerId = req.auth.roleCode === 'CUSTOMER' ? req.auth.userId : null;
    const booking = await getBookingDetails(bookingId, customerId);
    if (!booking) return res.status(404).json({ success: false, message: 'KhÃ´ng tÃ¬m tháº¥y booking.' });
    return res.json(toBookingDetailsResponse(booking));
  } catch (error) {
    console.error('Get booking details error:', error);
    return res.status(500).json({ success: false, message: 'KhÃ´ng thá»ƒ táº£i chi tiáº¿t booking.' });
  }
}

async function updateBookingHandler(req, res) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  let claims;
  try { claims = jwt.verify(token, JWT_SECRET); } catch {
    return res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn.' });
  }
  const customer = isCustomerClaims(claims);
  if (!customer && !hasRole(claims, 'RECEPTIONIST')) return res.status(403).json({ success: false, message: 'Bạn không có quyền cập nhật booking.' });
  const { check_in_date, check_out_date, guest_full_name, guest_phone, guest_email, adults, children, special_request, room_selections } = toUpdateBookingRequest(req.body);
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
  if (room_selections !== undefined && (
    !Array.isArray(room_selections)
    || room_selections.length === 0
    || room_selections.length > 20
    || room_selections.some((selection) =>
      !Number.isSafeInteger(Number(selection?.room_type_id))
      || Number(selection.room_type_id) < 1
      || !Number.isInteger(Number(selection.quantity))
      || Number(selection.quantity) < 1
    )
  )) {
    return res.status(400).json({ success: false, message: 'Danh sách loại phòng hoặc số lượng phòng không hợp lệ.' });
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
      roomSelections: room_selections?.map((selection) => ({
        roomTypeId: Number(selection.room_type_id),
        quantity: Number(selection.quantity),
      })),
    });
    return res.json(toUpdateBookingResponse({ success: true, message: 'Đã cập nhật booking.', booking }));
  } catch (error) {
    const message = error.message;
    const status = /not found/i.test(message) ? 404 : /cannot be updated|capacity|available|check-in date|24 hours|past|quantities cannot be fewer/i.test(message) ? 409 : 400;
    return res.status(status).json({ success: false, message });
  }
}

async function extendCheckedInBookingHandler(req, res) {
  const bookingId = Number(req.params.bookingId);
  const { expected_check_out_date: expectedCheckOutDate, new_check_out_date: newCheckOutDate, note } = toExtendStayRequest(req.body);
  if (!Number.isSafeInteger(bookingId) || bookingId < 1) {
    return res.status(400).json({ success: false, message: 'Mã booking không hợp lệ.' });
  }
  const isRealDate = (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  if (!isRealDate(expectedCheckOutDate) || !isRealDate(newCheckOutDate)) {
    return res.status(400).json({ success: false, message: 'Ngày trả phòng mới không hợp lệ.' });
  }
  if (typeof note !== 'string' || note.length > 255) {
    return res.status(400).json({ success: false, message: 'Ghi chú không được vượt quá 255 ký tự.' });
  }
  try {
    const extension = await extendCheckedInBooking({
      bookingId,
      expectedCheckOutDate,
      newCheckOutDate,
      note: note.trim(),
      performedByUserId: req.auth?.userId,
    });
    return res.json(toExtendStayResponse({ success: true, message: 'Gia hạn lưu trú thành công.', extension }));
  } catch (error) {
    const code = error.message;
    const knownErrors = {
      BOOKING_CHANGED: [409, 'Booking đã thay đổi sau khi mở form. Hãy tải lại thông tin booking.'],
      BOOKING_NOT_FOUND: [404, 'Không tìm thấy booking.'],
      BOOKING_NOT_CHECKED_IN: [409, 'Chỉ có thể gia hạn booking đang CHECKED_IN.'],
      BOOKING_ROOM_NOT_ASSIGNED: [409, 'Booking chưa được gán phòng thực tế.'],
      ROOM_UNAVAILABLE_FOR_EXTENSION: [409, 'Phòng đang trong tình trạng bảo trì hoặc cần dọn, không thể tiếp tục phục vụ.'],
      INVALID_EXTENSION_DATE: [400, 'Ngày trả phòng mới phải sau ngày trả phòng hiện tại.'],
      ROOM_PRICE_NOT_FOUND: [409, 'Không xác định được giá phòng cho booking này.'],
      PENDING_FINAL_PAYMENT: [409, 'Booking đang có giao dịch thanh toán chờ xử lý. Hãy hoàn tất hoặc hủy giao dịch trước khi gia hạn.'],
    };
    if (code.startsWith('ROOM_EXTENSION_CONFLICT:')) {
      const roomNumber = code.split(':')[1];
      return res.status(409).json({ success: false, message: `Phòng ${roomNumber || 'được gán'} đã có booking khác trong khoảng ngày gia hạn.` });
    }
    if (code.startsWith('ROOM_TYPE_EXTENSION_CONFLICT:')) {
      const roomTypeName = code.split(':')[1];
      return res.status(409).json({ success: false, message: `Không đủ phòng loại ${roomTypeName || 'đã đặt'} để gia hạn trong khoảng ngày này.` });
    }
    if (knownErrors[code]) {
      const [status, message] = knownErrors[code];
      return res.status(status).json({ success: false, message });
    }
    console.error('Extend booking error:', error);
    return res.status(500).json({ success: false, message: 'Không thể gia hạn booking lúc này. Vui lòng thử lại.' });
  }
}

async function getStayExtensionBillingHandler(req, res) {
  const bookingId = Number(req.params.bookingId);
  if (!Number.isSafeInteger(bookingId) || bookingId < 1) {
    return res.status(400).json({ success: false, message: 'Mã booking không hợp lệ.' });
  }
  try {
    const billing = await getStayExtensionBilling(bookingId);
    return res.json({ success: true, billing });
  } catch (error) {
    if (error.message === 'BOOKING_NOT_FOUND') return res.status(404).json({ success: false, message: 'Không tìm thấy booking.' });
    if (error.message === 'BOOKING_NOT_CHECKED_IN') return res.status(409).json({ success: false, message: 'Chỉ có thể xem chi phí gia hạn của booking đang CHECKED_IN.' });
    console.error('Get stay extension billing error:', error);
    return res.status(500).json({ success: false, message: 'Không thể tải chi phí booking hiện tại.' });
  }
}

async function extendBookingHoldHandler(req, res) {
  const bookingId = Number(req.params.bookingId);
  const { expected_arrival_at: expectedArrivalAt, reason } = toExtendHoldRequest(req.body);
  if (!Number.isSafeInteger(bookingId) || bookingId < 1) {
    return res.status(400).json({ success: false, message: 'Mã booking không hợp lệ.' });
  }
  const instantMatch = typeof expectedArrivalAt === 'string'
    ? expectedArrivalAt.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/)
    : null;
  const realCalendarDate = instantMatch && new Date(Date.UTC(
    Number(instantMatch[1]), Number(instantMatch[2]) - 1, Number(instantMatch[3]),
  )).toISOString().slice(0, 10) === `${instantMatch[1]}-${instantMatch[2]}-${instantMatch[3]}`;
  const realClockTime = instantMatch && Number(instantMatch[4]) < 24
    && Number(instantMatch[5]) < 60 && Number(instantMatch[6]) < 60;
  if (!instantMatch || !realCalendarDate || !realClockTime || !Number.isFinite(Date.parse(expectedArrivalAt))) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập giờ khách dự kiến đến hợp lệ.' });
  }
  if (typeof reason !== 'string' || reason.trim().length < 3 || reason.trim().length > 500) {
    return res.status(400).json({ success: false, message: 'Lý do gia hạn cần từ 3 đến 500 ký tự.' });
  }
  try {
    const hold = await extendBookingHold({
      bookingId,
      expectedArrivalAt: new Date(expectedArrivalAt),
      reason: reason.trim(),
      performedByUserId: req.auth?.userId,
    });
    return res.json(toExtendHoldResponse({ success: true, message: 'Đã gia hạn giữ phòng.', hold }));
  } catch (error) {
    const errors = {
      BOOKING_NOT_FOUND: [404, 'Không tìm thấy booking.'],
      BOOKING_NOT_WAITING_FOR_CHECK_IN: [409, 'Chỉ có thể gia hạn giữ phòng cho booking đã xác nhận và chưa check-in.'],
      BOOKING_HOLD_ALREADY_EXTENDED: [409, 'Booking này đã được gia hạn giữ phòng.'],
      BOOKING_HOLD_EXTENSION_LIMIT_REACHED: [409, 'Booking đã sử dụng tối đa 2 lần gia hạn giữ phòng.'],
      BOOKING_HOLD_EXPIRED: [409, 'Booking đã quá hạn giữ phòng và đang được xử lý.'],
      EXPECTED_ARRIVAL_MUST_BE_FUTURE: [400, 'Giờ khách dự kiến đến phải ở trong tương lai.'],
      EXPECTED_ARRIVAL_OUTSIDE_EXTENSION_WINDOW: [400, 'Giờ khách dự kiến đến phải sau hạn giữ phòng hiện tại và không vượt quá 2 giờ gia hạn.'],
      NEW_HOLD_MUST_EXTEND_CURRENT: [400, 'Hạn giữ mới (giờ dự kiến đến cộng 4 tiếng) phải sau hạn giữ hiện tại.'],
    };
    if (errors[error.message]) {
      const [status, message] = errors[error.message];
      return res.status(status).json({ success: false, message });
    }
    console.error('Extend booking hold error:', error);
    return res.status(500).json({ success: false, message: 'Không thể gia hạn giữ phòng lúc này.' });
  }
}

async function cancelBookingHandler(req, res) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  let claims;
  try { claims = jwt.verify(token, JWT_SECRET); } catch {
    return res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn.' });
  }
  const customer = isCustomerClaims(claims);
  if (!customer && !hasRole(claims, 'RECEPTIONIST')) return res.status(403).json({ success: false, message: 'Bạn không có quyền hủy booking.' });
  const { cancellation_reason_note: note } = toCancelBookingRequest(req.body);
  if (note != null && (typeof note !== 'string' || note.length > 500)) {
    return res.status(400).json({ success: false, message: 'Ghi chú hủy phải là văn bản tối đa 500 ký tự.' });
  }
  try {
    const booking = await cancelBooking({
      bookingId: req.params.bookingId,
      customerId: customer ? claims.user_id : null,
      cancelledBy: claims.user_id,
      cancellationNote: typeof note === 'string' && note.trim() ? note.trim() : null,
    });
    return res.json(toCancelBookingResponse({ success: true, message: 'Đã hủy booking.', booking }));
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
  if (!hasRole(claims, 'RECEPTIONIST')) return res.status(403).json({ success: false, message: 'Chỉ lễ tân mới được check-out.' });
  try {
    const result = await makeReceptionCheckoutPayment({
      bookingId: req.params.bookingId,
      method: toCheckOutRequest(req.body).payment_method,
      ipAddress: req.ip,
      createdByUserId: claims.user_id,
    });
    return res.json(toCheckOutResponse({
      success: true,
      message: result.payment_url ? 'Đã tạo giao dịch. Chuyển đến VNPay để thanh toán.' : 'Đã checkout và ghi nhận thanh toán.',
      booking: { booking_id: req.params.bookingId, status: 'CHECKED_OUT' },
      ...result,
    }));
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    if (/not found/i.test(error.message)) return res.status(404).json({ success: false, message: 'Không tìm thấy booking.' });
    if (/BOOKING_NOT_CHECKED_IN|chưa check-in/i.test(error.message)) {
      return res.status(409).json({ success: false, message: 'Booking này chưa check-in hoặc không thể check-out.' });
    }
    console.error('Check-out booking error:', error);
    return res.status(error.status || 500).json({ success: false, message: error.message || 'Không thể thực hiện check-out.' });
  }
}

async function createReceptionInvoiceHandler(req, res) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  let claims;
  try { claims = jwt.verify(token, JWT_SECRET); } catch {
    return res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn.' });
  }
  if (!hasRole(claims, 'RECEPTIONIST', 'ADMIN')) return res.status(403).json({ success: false, message: 'Chỉ lễ tân hoặc quản trị viên mới được tạo hóa đơn.' });
  const bookingId = Number(req.params.bookingId);
  if (!Number.isSafeInteger(bookingId) || bookingId < 1) return res.status(400).json({ success: false, message: 'Mã booking không hợp lệ.' });
  try {
    const invoice = await createReceptionInvoice(bookingId, claims.user_id);
    return res.json({ success: true, message: invoice.created ? 'Đã tạo hóa đơn.' : 'Booking đã có hóa đơn.', ...invoice });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    console.error('Create reception invoice error:', error);
    return res.status(500).json({ success: false, message: 'Không thể tạo hóa đơn.' });
  }
}

async function syncReceptionBookingCompensationsHandler(req, res) {
  const bookingId = Number(req.params.bookingId);
  if (!Number.isSafeInteger(bookingId) || bookingId < 1) return res.status(400).json({ success: false, message: 'MĂ£ booking khĂ´ng há»£p lá»‡.' });
  try {
    const result = await syncReceptionBookingCompensations(bookingId);
    return res.json(toSyncInvoiceCompensationsResponse(result));
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message, code: error.code });
    console.error('Reception compensation invoice sync error:', error);
    return res.status(500).json({ success: false, message: 'KhĂ´ng thá»ƒ Ä‘á»“ng bá»™ bồi thường vĂ o hĂ³a Ä‘Æ¡n.' });
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
    const roomStatusRequest = toUpdateRoomStatusRequest(req.body);
    const targetStatus = String(roomStatusRequest.status || 'AVAILABLE').toUpperCase();
    const currentStatus = String(roomStatusRequest.current_status || 'CLEANING').toUpperCase();
    const isAdminMaintenanceTransition = (currentStatus === 'AVAILABLE' && targetStatus === 'MAINTENANCE')
      || (currentStatus === 'MAINTENANCE' && targetStatus === 'AVAILABLE');
    if (isAdminMaintenanceTransition && !hasRole(claims, 'ADMIN')) {
      return res.status(403).json({ success: false, message: 'Chỉ quản trị viên mới được cập nhật trạng thái bảo trì phòng.' });
    }
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
    return res.json(toUpdateRoomStatusResponse(message, room));
  } catch (error) {
    if (/not waiting for cleaning completion/i.test(error.message)) {
      return res.status(409).json({ success: false, message: 'Trạng thái phòng đã thay đổi hoặc không còn phù hợp với thao tác này.' });
    }
    console.error('Update room status error:', error);
    return res.status(500).json({ success: false, message: 'Không thể cập nhật trạng thái phòng.' });
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
      description: toReportRoomMaintenanceRequest(req.body).description,
    });
    return res.json(toReportRoomMaintenanceResponse(report));
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
  if (!hasRole(claims, 'RECEPTIONIST')) return res.status(403).json({ success: false, message: 'Chỉ lễ tân được xem phòng có thể gán.' });
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
  if (!hasRole(claims, 'RECEPTIONIST')) return res.status(403).json({ success: false, message: 'Chỉ lễ tân được gán phòng.' });
  const { room_assignments: roomAssignments } = toAssignRoomRequest(req.body);
  if (!Array.isArray(roomAssignments) || !roomAssignments.length || roomAssignments.some((item) => !Number.isInteger(Number(item.booking_room_id)) || Number(item.booking_room_id) <= 0 || !Number.isInteger(Number(item.room_id)) || Number(item.room_id) <= 0)) return res.status(400).json({ success: false, message: 'Please assign a room to every booking room.' });
  try {
    const assignment = await assignRoomToBooking({ bookingId: req.params.bookingId, roomAssignments: roomAssignments.map((item) => ({ booking_room_id: Number(item.booking_room_id), room_id: Number(item.room_id) })) });
    return res.json(toAssignRoomResponse({ success: true, message: 'Đã gán phòng cho booking.', assignment }));
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
  getInHouseBookingsHandler,
  getBookingDetailsHandler,
  updateBookingHandler,
  extendCheckedInBookingHandler,
  extendBookingHoldHandler,
  getStayExtensionBillingHandler,
  cancelBookingHandler,
  getActiveBookingsHandler,
  checkOutBookingHandler,
  createReceptionInvoiceHandler,
  syncReceptionBookingCompensationsHandler,
  finishRoomCleaningHandler,
  updateRoomStatusHandler: finishRoomCleaningHandler,
  reportRoomMaintenanceHandler,
  getRoomMaintenanceReportsHandler,
  resolveRoomMaintenanceReportHandler,
  getRoomStatusesHandler,
  getAssignableRoomsHandler,
  assignRoomHandler,
};
