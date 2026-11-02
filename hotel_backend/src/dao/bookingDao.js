const { sql, getPool } = require('../config/db');
const { formatHotelWallTimeForSql, MAX_HOLD_EXTENSIONS, serializeBookingHoldFields, validateHoldExtension } = require('../services/bookingHoldService');
const { getCancellationReasonCode, getCancellationReasonLabel } = require('../services/cancellationReasons');
const { getHotelDate } = require('../utils/hotelTime');
const { calculateNights, generateBookingCode } = require('../utils/booking');

function effectiveHoldUntilSql(alias) {
  return `CASE WHEN ${alias}.hold_extended = 1 AND ${alias}.expected_arrival_at IS NOT NULL AND ${alias}.hold_until IS NOT NULL
    THEN ${alias}.hold_until
    ELSE DATEADD(hour, 4, CASE WHEN ${alias}.created_at > DATEADD(hour, 14, CONVERT(datetime2, ${alias}.check_in_date))
      THEN ${alias}.created_at ELSE DATEADD(hour, 14, CONVERT(datetime2, ${alias}.check_in_date)) END)
  END`;
}

const hotelNowSql = 'DATEADD(hour, 7, SYSUTCDATETIME())';

/**
 * ============================================================================
 * CHỨC NĂNG: ĐẶT PHÒNG TẠI QUẦY (WALK-IN BOOKING) DÀNH CHO LỄ TÂN - DAO
 * ============================================================================
 * Lễ tân khi vào Dashboard có thể:
 * 1. Xem danh sách loại phòng và phòng trống (Check Room Availability).
 * 2. Đặt phòng trực tiếp cho khách vãng lai (walk-in guest).
 * 3. Tự động kiểm tra phòng có bị trùng không trước khi tạo đơn.
 * 4. Tự động tạo hồ sơ khách hàng mới (nếu chưa có trong hệ thống users).
 * 5. Lưu thông tin vào bookings, booking_rooms, booking_guests và cập nhật trạng thái phòng.
 */

function activeReservationPredicate(alias) {
  // A pending VNPay deposit must continue reserving inventory until its callback resolves,
  // even if the browser/payment URL's 15-minute window has elapsed.
  return `(${alias}.status = 'CHECKED_IN' OR (${alias}.status = 'CONFIRMED' AND (
    ${effectiveHoldUntilSql(alias)} > ${hotelNowSql}
    OR EXISTS (SELECT 1 FROM dbo.booking_rooms hold_br JOIN dbo.rooms hold_room ON hold_room.id = hold_br.room_id
      WHERE hold_br.booking_id = ${alias}.id AND hold_room.status = 'OCCUPIED')
  )) OR (
    ${alias}.status = 'PENDING_PAYMENT' AND (
      ${alias}.created_at > DATEADD(minute, -15, ${hotelNowSql})
      OR EXISTS (SELECT 1 FROM dbo.payments pending_payment
        WHERE pending_payment.booking_id = ${alias}.id
          AND pending_payment.payment_type = 'DEPOSIT'
          AND pending_payment.status = 'PENDING')
    )
  ))`;
}

async function expirePendingBookings() {
  const pool = await getPool();
  const result = await pool.request().query(`
    DECLARE @expired TABLE (id BIGINT PRIMARY KEY);
    UPDATE b
    SET status = 'CANCELLED', cancellation_reason = 'PAYMENT_TIMEOUT',
        cancellation_reason_code = N'PAYMENT_TIMEOUT', cancellation_reason_note = NULL,
        cancelled_at = SYSUTCDATETIME(), cancelled_by = NULL
    OUTPUT INSERTED.id INTO @expired(id)
    FROM dbo.bookings b
    WHERE b.status = 'PENDING_PAYMENT'
      AND b.created_at <= DATEADD(minute, -15, ${hotelNowSql})
      AND NOT EXISTS (
        SELECT 1 FROM dbo.payments pending_payment
        WHERE pending_payment.booking_id = b.id
          AND pending_payment.payment_type = 'DEPOSIT'
          AND pending_payment.status = 'PENDING'
      );

    UPDATE p
    SET status = 'FAILED'
    FROM dbo.payments p
    JOIN @expired e ON e.id = p.booking_id
    WHERE p.payment_type = 'DEPOSIT' AND p.status = 'PENDING';

    SELECT COUNT(*) AS expired_count FROM @expired;
  `);
  return Number(result.recordset[0]?.expired_count ?? 0);
}

async function expireReservationsPastCheckIn() {
  const pool = await getPool();
  const result = await pool.request().query(`
    DECLARE @expired TABLE (id BIGINT PRIMARY KEY, old_hold_until DATETIME2);
    SET XACT_ABORT ON;
    BEGIN TRY
      BEGIN TRANSACTION;
      UPDATE b WITH (UPDLOCK, ROWLOCK)
      SET status = 'CANCELLED', cancellation_reason = 'RESERVATION_EXPIRED',
          cancellation_reason_code = N'CHECK_IN_EXPIRED', cancellation_reason_note = NULL,
          cancelled_at = SYSUTCDATETIME(), cancelled_by = NULL
      OUTPUT INSERTED.id, DELETED.hold_until INTO @expired(id, old_hold_until)
      FROM dbo.bookings b
      WHERE b.status = 'CONFIRMED'
        AND ${effectiveHoldUntilSql('b')} <= ${hotelNowSql}
        AND NOT EXISTS (
          SELECT 1 FROM dbo.booking_rooms br
          JOIN dbo.rooms r ON r.id = br.room_id
          WHERE br.booking_id = b.id AND r.status = 'OCCUPIED'
        )
        AND NOT EXISTS (
          SELECT 1 FROM dbo.payments p
          WHERE p.booking_id = b.id AND p.payment_type = 'DEPOSIT' AND p.status = 'PENDING'
        );

      INSERT INTO dbo.booking_hold_events (booking_id, event_type, old_hold_until, reason)
      SELECT id, 'AUTO_CANCELLED', old_hold_until, N'Khách không check-in trước thời hạn giữ phòng.'
      FROM @expired;
      COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
      IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
      THROW;
    END CATCH;
    SELECT COUNT(*) AS expired_count FROM @expired;
  `);
  return Number(result.recordset[0]?.expired_count ?? 0);
}

async function expireStaleBookings() {
  const paymentExpiredCount = await expirePendingBookings();
  const reservationExpiredCount = await expireReservationsPastCheckIn();
  return paymentExpiredCount + reservationExpiredCount;
}

/**
 * Tạo đơn đặt phòng trực tiếp tại quầy (Walk-in booking)
 * @param {Object} data - Dữ liệu đặt phòng từ quầy lễ tân
 * @returns {Promise<Object>} Thông tin đặt phòng vừa tạo thành công
 */
async function createWalkInBooking(data) {
  const {
    roomSelections = [{ roomTypeId: data.roomTypeId, roomId: data.roomId }],
    checkInDate,
    checkOutDate,
    adults = 1,
    children = 0,
    guestFullName,
    guestPhone,
    guestEmail,
    guestIdCard = '',
    guestIdCardImage = null,
    guestIdCardImageMimeType = null,
    guestIdCardBackImage = null,
    guestIdCardBackImageMimeType = null,
    depositAmount = 0,
    serviceSelections = [],
    promotionCode = '',
    specialRequest = '',
    checkInNow = true,
    createdByUserId = null,
  } = data;

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {

  // Kiểm tra từng loại phòng được chọn và chọn phòng vật lý cho từng dòng.
  const nights = calculateNights(checkInDate, checkOutDate);
  const selectedRooms = [];
  const selectedPhysicalRoomIds = new Set();
  let totalPerNight = 0;
  let totalCapacityAdults = 0;
  let totalCapacityChildren = 0;
  for (const selection of roomSelections) {
    const roomTypeResult = await transaction.request()
      .input('roomTypeId', sql.Int, Number(selection.roomTypeId))
      .query('SELECT TOP 1 id, name, base_price, max_adults, max_children FROM room_types WHERE id = @roomTypeId;');
    if (!roomTypeResult.recordset.length) throw new Error('Loại phòng không tồn tại trong hệ thống.');
    const roomType = roomTypeResult.recordset[0];
    let selectedRoom = null;
    const roomQuery = transaction.request()
      .input('roomTypeId', sql.Int, roomType.id)
      .input('checkIn', sql.Date, checkInDate)
      .input('checkOut', sql.Date, checkOutDate);
    let roomFilter = 'r.room_type_id = @roomTypeId';
    if (checkInNow) roomFilter += " AND r.status = 'AVAILABLE'";
    if (selection.roomId) {
      roomQuery.input('roomId', sql.Int, Number(selection.roomId));
      roomFilter += ' AND r.id = @roomId';
    }
    const roomCheck = await roomQuery.query(`
      SELECT TOP 100 r.id, r.room_number, r.status
      FROM rooms r WITH (UPDLOCK, HOLDLOCK)
      WHERE ${roomFilter}
        AND r.status <> 'MAINTENANCE'
        AND NOT EXISTS (
          SELECT 1 FROM booking_rooms br WITH (UPDLOCK, HOLDLOCK) JOIN bookings b WITH (UPDLOCK, HOLDLOCK) ON b.id = br.booking_id
          WHERE br.room_id = r.id AND ${activeReservationPredicate('b')}
            AND b.check_in_date < @checkOut AND b.check_out_date > @checkIn
        )
      ORDER BY r.room_number;
    `);
    if (selection.roomId && !roomCheck.recordset.length) throw new Error(`Phòng đã chọn không còn trống cho loại ${roomType.name}.`);
    selectedRoom = roomCheck.recordset.find((room) => !selectedPhysicalRoomIds.has(Number(room.id))) || null;
    if (selectedRoom) selectedPhysicalRoomIds.add(Number(selectedRoom.id));
    if (!selectedRoom && selection.roomId) throw new Error(`Không còn phòng trống cho loại ${roomType.name}.`);
    selectedRooms.push({ roomType, room: selectedRoom });
    totalPerNight += Number(roomType.base_price);
    totalCapacityAdults += Number(roomType.max_adults);
    totalCapacityChildren += Number(roomType.max_children);
  }
  if (Number(adults) > totalCapacityAdults || Number(children) > totalCapacityChildren) throw new Error('Số khách vượt quá sức chứa của các phòng đã chọn.');
  const validServices = [];
  for (const serviceSelection of serviceSelections) {
    const serviceId = Number(serviceSelection.serviceId);
    const quantity = Number(serviceSelection.quantity);
    if (!Number.isInteger(serviceId) || serviceId < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      throw new Error('Service selection is invalid.');
    }
    const serviceResult = await transaction.request()
      .input('serviceId', sql.Int, serviceId)
      .query('SELECT TOP 1 id, price, booking_policy FROM services WHERE id = @serviceId AND is_active = 1 AND is_deleted = 0;');
    if (!serviceResult.recordset.length) throw new Error('Selected service was not found.');
    if (serviceResult.recordset[0].booking_policy !== 'PREBOOK') {
      throw new Error('Only prebook services can be selected when creating a booking.');
    }
    validServices.push({ serviceId, quantity, price: Number(serviceResult.recordset[0].price ?? 0) });
  }
  const serviceTotal = validServices.reduce((sum, service) => sum + service.price * service.quantity, 0) * selectedRooms.length;
  const originalTotalAmount = totalPerNight * nights + serviceTotal;
  let discountAmount = 0;
  let promotion = null;
  if (promotionCode) {
    const promotionResult = await transaction.request()
      .input('code', sql.VarChar(50), String(promotionCode).trim().toUpperCase())
      .query(`SELECT TOP (1) id, code, discount_type, discount_value, max_discount
        FROM dbo.promotions
        WHERE UPPER(LTRIM(RTRIM(code))) = @code AND is_active = 1
          AND CONVERT(date, DATEADD(hour, 7, SYSUTCDATETIME())) BETWEEN valid_from AND valid_to;`);
    promotion = promotionResult.recordset[0];
    if (!promotion) throw new Error('Promotion code is invalid, inactive, or expired.');
    discountAmount = promotion.discount_type === 'PERCENT'
      ? Math.floor(originalTotalAmount * Number(promotion.discount_value) / 100)
      : Number(promotion.discount_value);
    if (promotion.max_discount != null) discountAmount = Math.min(discountAmount, Number(promotion.max_discount));
    discountAmount = Math.max(0, Math.min(originalTotalAmount, discountAmount));
  }
  const totalAmount = originalTotalAmount - discountAmount;
  const finalDeposit = Number(depositAmount ?? 0);

  // 3. Tìm hoặc tạo khách hàng (customer) trong bảng users
  // Vì bảng bookings có FK customer_id NOT NULL -> bắt buộc cần user id
  const emailToUse = guestEmail && guestEmail.trim()
    ? guestEmail.trim().toLowerCase()
    : `walkin_${guestPhone.replace(/\D/g, '')}@hotellumiere.vn`;

  let customerId = null;

  const userQuery = await transaction.request()
    .input('email', sql.VarChar(150), emailToUse)
    .input('phone', sql.VarChar(20), guestPhone.trim())
    .query(`
      SELECT TOP 1 id, full_name, email, phone
      FROM users
      WHERE LOWER(email) = LOWER(@email) OR phone = @phone;
    `);

  if (userQuery.recordset.length > 0) {
    customerId = userQuery.recordset[0].id;
  } else {
    // Tạo tài khoản khách hàng mới cho khách vãng lai
    const createUserResult = await transaction.request()
      .input('role_id', sql.TinyInt, 4) // CUSTOMER
      .input('email', sql.VarChar(150), emailToUse)
      .input('password_hash', sql.VarChar(255), 'WALKIN_GUEST')
      .input('full_name', sql.NVarChar(255), guestFullName.trim())
      .input('phone', sql.VarChar(20), guestPhone.trim())
      .input('status', sql.VarChar(20), 'ACTIVE')
      .query(`
        INSERT INTO users (role_id, email, password_hash, full_name, phone, status)
        OUTPUT INSERTED.id
        VALUES (@role_id, @email, @password_hash, @full_name, @phone, @status);
      `);

    customerId = createUserResult.recordset[0].id;
  }

  // 4. Tạo mã booking và xác định trạng thái ban đầu
  // Walk-in bookings check guests in immediately; no online deposit is required at the desk.
  const bookingCode = generateBookingCode();
  const initialStatus = checkInNow ? 'CHECKED_IN' : 'CONFIRMED';
  if (checkInNow && selectedRooms.some(({ room }) => !room)) throw new Error('Cannot check in before every room is assigned and ready.');
  let checkInStaffId = null;
  if (checkInNow && createdByUserId != null) {
    const staffResult = await transaction.request()
      .input('userId', sql.BigInt, Number(createdByUserId))
      .query('SELECT TOP (1) id FROM dbo.staff WITH (UPDLOCK, HOLDLOCK) WHERE user_id = @userId;');
    checkInStaffId = staffResult.recordset[0]?.id ?? null;
    if (checkInStaffId == null) throw new Error('Staff profile was not found for check-in user.');
  }

  // 5. Thêm bản ghi vào bảng bookings
  const insertBookingResult = await transaction.request()
    .input('booking_code', sql.VarChar(20), bookingCode)
    .input('customer_id', sql.BigInt, customerId)
    .input('guest_full_name', sql.NVarChar(150), guestFullName.trim())
    .input('guest_phone', sql.VarChar(20), guestPhone.trim())
    .input('guest_email', sql.VarChar(150), emailToUse)
    .input('check_in_date', sql.Date, checkInDate)
    .input('check_out_date', sql.Date, checkOutDate)
    .input('adults', sql.TinyInt, Number(adults))
    .input('children', sql.TinyInt, Number(children))
    .input('status', sql.VarChar(20), initialStatus)
    .input('total_amount', sql.Decimal(12, 2), totalAmount)
    .input('original_total_amount', sql.Decimal(12, 2), originalTotalAmount)
    .input('discount_amount', sql.Decimal(12, 2), discountAmount)
    .input('promotion_id', sql.Int, promotion?.id ?? null)
    .input('promotion_code', sql.VarChar(50), promotion?.code ?? null)
    .input('promotion_discount_type', sql.VarChar(20), promotion?.discount_type ?? null)
    .input('promotion_discount_value', sql.Decimal(12, 2), promotion ? Number(promotion.discount_value) : null)
    .input('promotion_max_discount', sql.Decimal(12, 2), promotion?.max_discount == null ? null : Number(promotion.max_discount))
    .input('deposit_amount', sql.Decimal(12, 2), finalDeposit)
    .input('special_request', sql.NVarChar(500), specialRequest ? specialRequest.trim() : null)
    .query(`
      DECLARE @createdAt DATETIME2 = ${hotelNowSql};
      INSERT INTO bookings (
        booking_code, customer_id, guest_full_name, guest_phone, guest_email,
        check_in_date, check_out_date, adults, children, status,
        total_amount, deposit_amount, created_at, special_request, original_total_amount, discount_amount,
        promotion_id, promotion_code, promotion_discount_type, promotion_discount_value, promotion_max_discount,
        hold_until, hold_extended
      )
      OUTPUT INSERTED.id, INSERTED.booking_code,
        CONVERT(varchar(33), INSERTED.created_at, 126) + '+07:00' AS created_at,
        CONVERT(varchar(33), INSERTED.hold_until, 126) + '+07:00' AS hold_until, INSERTED.hold_extended
      VALUES (
        @booking_code, @customer_id, @guest_full_name, @guest_phone, @guest_email,
        @check_in_date, @check_out_date, @adults, @children, @status,
        @total_amount, @deposit_amount, @createdAt, @special_request, @original_total_amount, @discount_amount,
        @promotion_id, @promotion_code, @promotion_discount_type, @promotion_discount_value, @promotion_max_discount,
        CASE WHEN @status = 'CONFIRMED' THEN
          DATEADD(hour, 4, CASE WHEN @createdAt > DATEADD(hour, 14, CONVERT(datetime2, @check_in_date))
            THEN @createdAt ELSE DATEADD(hour, 14, CONVERT(datetime2, @check_in_date)) END)
          ELSE NULL END,
        0
      );
    `);

  const createdBooking = insertBookingResult.recordset[0];
  const newBookingId = createdBooking.id;

  // Thêm một dòng booking_rooms cho mỗi phòng đã chọn.
  for (const selected of selectedRooms) {
    const roomInsert = await transaction.request()
      .input('booking_id', sql.BigInt, newBookingId)
      .input('room_type_id', sql.Int, selected.roomType.id)
      .input('room_id', sql.Int, selected.room?.id ?? null)
      .input('price_per_night', sql.Decimal(12, 2), Number(selected.roomType.base_price))
      .input('checkInNow', sql.Bit, checkInNow)
      .input('checkInStaffId', sql.BigInt, checkInStaffId)
      .query(`
        INSERT INTO booking_rooms (booking_id, room_type_id, room_id, price_per_night, actual_check_in, checked_in_by_staff_id)
        OUTPUT INSERTED.id
        VALUES (@booking_id, @room_type_id, @room_id, @price_per_night,
          CASE WHEN @checkInNow = 1 THEN SYSUTCDATETIME() ELSE NULL END,
          CASE WHEN @checkInNow = 1 THEN @checkInStaffId ELSE NULL END);
      `);
    for (const service of validServices) {
      await transaction.request()
        .input('bookingRoomId', sql.BigInt, roomInsert.recordset[0].id)
        .input('serviceId', sql.Int, service.serviceId)
        .input('quantity', sql.Int, service.quantity)
        .input('unitPrice', sql.Decimal(18, 2), service.price)
        .query(`
          INSERT INTO booking_services (booking_room_id, service_id, quantity, unit_price)
          VALUES (@bookingRoomId, @serviceId, @quantity, @unitPrice);
        `);
    }
  }

  // 7. Thêm thông tin khách lưu trú vào booking_guests
  await transaction.request()
    .input('booking_id', sql.BigInt, newBookingId)
    .input('full_name', sql.NVarChar(150), guestFullName.trim())
    .input('phone', sql.VarChar(20), guestPhone.trim())
    .input('id_card_number', sql.VarChar(50), guestIdCard ? guestIdCard.trim() : null)
    .input('idCardImage', sql.VarBinary(sql.MAX), guestIdCardImage)
    .input('idCardImageMimeType', sql.VarChar(50), guestIdCardImageMimeType)
    .input('idCardBackImage', sql.VarBinary(sql.MAX), guestIdCardBackImage)
    .input('idCardBackImageMimeType', sql.VarChar(50), guestIdCardBackImageMimeType)
    .input('id_card_verified', sql.Bit, checkInNow && guestIdCardImage && guestIdCardBackImage ? 1 : 0)
    .query(`
      INSERT INTO booking_guests (booking_id, full_name, phone, id_card_number, id_card_image, id_card_image_mime_type, id_card_back_image, id_card_back_image_mime_type, id_card_verified)
      VALUES (@booking_id, @full_name, @phone, @id_card_number, @idCardImage, @idCardImageMimeType, @idCardBackImage, @idCardBackImageMimeType, @id_card_verified);
    `);

  // 8. Nếu nhận phòng ngay (checkInNow) và đã chọn số phòng, cập nhật trạng thái phòng vật lý
  if (checkInNow) {
    for (const selected of selectedRooms) {
    await transaction.request()
      .input('roomId', sql.Int, selected.room?.id)
      .query(`
        UPDATE rooms
        SET status = 'OCCUPIED'
        WHERE id = @roomId;
      `);
    }
  }

  // 9. Trả về kết quả hoàn chỉnh
  await transaction.commit();
  return {
    booking_id: newBookingId,
    booking_code: createdBooking.booking_code,
    room_type_name: selectedRooms.map(({ roomType }) => roomType.name).join(', '),
    room_number: selectedRooms.map(({ room }) => room?.room_number).filter(Boolean).join(', ') || null,
    guest_full_name: guestFullName.trim(),
    guest_phone: guestPhone.trim(),
    check_in_date: checkInDate,
    check_out_date: checkOutDate,
    nights,
    price_per_night: totalPerNight,
    original_total_amount: originalTotalAmount,
    discount_amount: discountAmount,
    promotion_code: promotion?.code ?? null,
    total_amount: totalAmount,
    deposit_amount: finalDeposit,
    remaining_balance: totalAmount - finalDeposit,
    status: initialStatus,
    created_at: createdBooking.created_at,
    hold_until: createdBooking.hold_until,
    hold_extended: Boolean(createdBooking.hold_extended),
  };
  } catch (error) {
    try { await transaction.rollback(); } catch (rollbackError) { console.error('Walk-in booking rollback error:', rollbackError); }
    throw error;
  }
}

/**
 * Lấy danh sách các lượt đặt phòng gần nhất cho màn hình Lễ tân
 * @param {number} [limit=10]
 * @returns {Promise<Array>}
 */
async function createCustomerBooking(data) {
  const {
    customerId,
    roomSelections = [{ roomTypeId: data.roomTypeId, quantity: 1 }],
    serviceSelections = [],
    checkInDate,
    checkOutDate,
    adults = 1,
    children = 0,
    specialRequest = '',
    promotionCode = '',
  } = data;
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    const customerResult = await transaction.request()
      .input('customerId', sql.BigInt, Number(customerId))
      .query(`
        SELECT TOP 1 id, full_name, email, phone
        FROM users
        WHERE id = @customerId AND role_id = 4 AND status = 'ACTIVE';
      `);
    if (!customerResult.recordset.length) throw new Error('Customer account is unavailable.');
    const customer = customerResult.recordset[0];

    const nights = calculateNights(checkInDate, checkOutDate);
    const selectedTypes = [];
    let totalCapacityAdults = 0;
    let totalCapacityChildren = 0;
    let totalPerNight = 0;
    for (const selection of roomSelections) {
      const roomTypeResult = await transaction.request()
        .input('roomTypeId', sql.Int, Number(selection.roomTypeId))
        .query('SELECT TOP 1 id, name, base_price, max_adults, max_children FROM room_types WHERE id = @roomTypeId;');
      if (!roomTypeResult.recordset.length) throw new Error('Room type was not found.');
      const roomType = roomTypeResult.recordset[0];
      const quantity = Number(selection.quantity);
      const inventoryResult = await transaction.request()
        .input('roomTypeId', sql.Int, Number(selection.roomTypeId))
        .input('checkIn', sql.Date, checkInDate)
        .input('checkOut', sql.Date, checkOutDate)
        .query(`
          SELECT
            (SELECT COUNT(*) FROM rooms r WITH (UPDLOCK, HOLDLOCK)
             WHERE r.room_type_id = @roomTypeId AND r.status <> 'MAINTENANCE') AS inventory_count,
            (SELECT COUNT(*) FROM booking_rooms br WITH (UPDLOCK, HOLDLOCK)
             JOIN bookings b WITH (UPDLOCK, HOLDLOCK) ON b.id = br.booking_id
             WHERE br.room_type_id = @roomTypeId AND ${activeReservationPredicate('b')}
               AND b.check_in_date < @checkOut AND b.check_out_date > @checkIn) AS reserved_count;
        `);
      const inventory = inventoryResult.recordset[0];
      if (!inventory || Number(inventory.inventory_count) - Number(inventory.reserved_count) < quantity) {
        throw new Error(`Not enough rooms available for room type ${roomType.name}.`);
      }
      totalCapacityAdults += Number(roomType.max_adults) * quantity;
      totalCapacityChildren += Number(roomType.max_children) * quantity;
      totalPerNight += Number(roomType.base_price) * quantity;
      selectedTypes.push({ ...roomType, quantity });
    }
    if (Number(adults) < 1 || Number(adults) > totalCapacityAdults || Number(children) > totalCapacityChildren) {
      throw new Error('Guest count exceeds selected rooms capacity.');
    }
    const validServices = [];
    for (const serviceSelection of serviceSelections) {
      const serviceId = Number(serviceSelection.serviceId);
      const quantity = Number(serviceSelection.quantity);
      if (!Number.isInteger(serviceId) || serviceId < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
        throw new Error('Service selection is invalid.');
      }
      const serviceResult = await transaction.request()
        .input('serviceId', sql.Int, serviceId)
        .query(`
          SELECT TOP 1 id, name, price, booking_policy
          FROM services
          WHERE id = @serviceId AND is_active = 1 AND is_deleted = 0;
        `);
      if (!serviceResult.recordset.length) throw new Error('Selected service was not found.');
      const service = serviceResult.recordset[0];
      if (service.booking_policy !== 'PREBOOK') {
        throw new Error('Only prebook services can be selected when creating a booking.');
      }
      validServices.push({ serviceId: Number(service.id), quantity, price: Number(service.price ?? 0), name: service.name });
    }

    const selectedRoomCount = selectedTypes.reduce((count, roomType) => count + roomType.quantity, 0);
    const serviceTotal = validServices.reduce((sum, service) => sum + service.price * service.quantity, 0) * selectedRoomCount;
    const originalTotalAmount = totalPerNight * nights + serviceTotal;
    let discountAmount = 0;
    let promotion = null;
    if (promotionCode) {
      const promoResult = await transaction.request()
        .input('code', sql.VarChar(50), String(promotionCode).trim().toUpperCase())
        .query(`SELECT TOP 1 id, code, discount_type, discount_value, max_discount FROM dbo.promotions
          WHERE UPPER(LTRIM(RTRIM(code))) = @code AND is_active = 1
            AND CONVERT(date, DATEADD(hour, 7, SYSUTCDATETIME())) BETWEEN valid_from AND valid_to;`);
      promotion = promoResult.recordset[0];
      if (!promotion) throw new Error('Promotion code is invalid, inactive, or expired.');
      discountAmount = promotion.discount_type === 'PERCENT'
        ? Math.floor(originalTotalAmount * Number(promotion.discount_value) / 100)
        : Number(promotion.discount_value);
      if (promotion.max_discount != null) discountAmount = Math.min(discountAmount, Number(promotion.max_discount));
      discountAmount = Math.max(0, Math.min(originalTotalAmount, discountAmount));
    }
    const totalAmount = originalTotalAmount - discountAmount;
    const requiredDepositAmount = Math.ceil(totalAmount * 0.3);
    const bookingCode = generateBookingCode();
    const bookingResult = await transaction.request()
      .input('booking_code', sql.VarChar(20), bookingCode)
      .input('customer_id', sql.BigInt, customer.id)
      .input('guest_full_name', sql.NVarChar(150), customer.full_name)
      .input('guest_phone', sql.VarChar(20), customer.phone)
      .input('guest_email', sql.VarChar(150), customer.email)
      .input('check_in_date', sql.Date, checkInDate)
      .input('check_out_date', sql.Date, checkOutDate)
      .input('adults', sql.TinyInt, Number(adults))
      .input('children', sql.TinyInt, Number(children))
      .input('total_amount', sql.Decimal(12, 2), totalAmount)
      .input('original_total_amount', sql.Decimal(12, 2), originalTotalAmount)
      .input('discount_amount', sql.Decimal(12, 2), discountAmount)
      .input('promotion_id', sql.Int, promotion?.id ?? null)
      .input('promotion_code', sql.VarChar(50), promotion?.code ?? null)
      .input('promotion_discount_type', sql.VarChar(20), promotion?.discount_type ?? null)
      .input('promotion_discount_value', sql.Decimal(12, 2), promotion ? Number(promotion.discount_value) : null)
      .input('promotion_max_discount', sql.Decimal(12, 2), promotion?.max_discount == null ? null : Number(promotion.max_discount))
      .input('special_request', sql.NVarChar(500), specialRequest ? String(specialRequest).trim() : null)
      .query(`
        INSERT INTO bookings (
          booking_code, customer_id, guest_full_name, guest_phone, guest_email,
          check_in_date, check_out_date, adults, children, status,
          total_amount, deposit_amount, created_at, special_request, original_total_amount, discount_amount,
          promotion_id, promotion_code, promotion_discount_type, promotion_discount_value, promotion_max_discount,
          hold_until, hold_extended
        )
        OUTPUT INSERTED.id, INSERTED.booking_code,
          CONVERT(varchar(33), INSERTED.created_at, 126) + '+07:00' AS created_at,
          INSERTED.hold_until, INSERTED.hold_extended
        VALUES (
          @booking_code, @customer_id, @guest_full_name, @guest_phone, @guest_email,
          @check_in_date, @check_out_date, @adults, @children, 'PENDING_PAYMENT',
          @total_amount, 0, ${hotelNowSql}, @special_request, @original_total_amount, @discount_amount,
          @promotion_id, @promotion_code, @promotion_discount_type, @promotion_discount_value, @promotion_max_discount,
          NULL, 0
        );
      `);
    const booking = bookingResult.recordset[0];

    const bookingRoomIds = [];
    for (const roomType of selectedTypes) {
      for (let index = 0; index < roomType.quantity; index += 1) {
        const roomInsertResult = await transaction.request()
          .input('booking_id', sql.BigInt, booking.id)
          .input('room_type_id', sql.Int, roomType.id)
          .input('price_per_night', sql.Decimal(12, 2), Number(roomType.base_price))
          .query(`
            INSERT INTO booking_rooms (booking_id, room_type_id, room_id, price_per_night)
            OUTPUT INSERTED.id
            VALUES (@booking_id, @room_type_id, NULL, @price_per_night);
          `);
        bookingRoomIds.push(Number(roomInsertResult.recordset[0].id));
      }
    }

    if (validServices.length > 0) {
      for (const service of validServices) {
        for (const bookingRoomId of bookingRoomIds) {
          await transaction.request()
            .input('bookingRoomId', sql.BigInt, bookingRoomId)
            .input('serviceId', sql.Int, service.serviceId)
            .input('quantity', sql.Int, service.quantity)
            .input('unitPrice', sql.Decimal(18, 2), service.price)
            .query(`
              INSERT INTO booking_services (booking_room_id, service_id, quantity, unit_price)
              VALUES (@bookingRoomId, @serviceId, @quantity, @unitPrice);
            `);
        }
      }
    }

    await transaction.request()
      .input('booking_id', sql.BigInt, booking.id)
      .input('full_name', sql.NVarChar(150), customer.full_name)
      .input('phone', sql.VarChar(20), customer.phone)
      .query(`
        INSERT INTO booking_guests (booking_id, full_name, phone, id_card_verified)
        VALUES (@booking_id, @full_name, @phone, 0);
      `);

    await transaction.commit();
    return {
      booking_id: booking.id,
      booking_code: booking.booking_code,
      room_type_name: selectedTypes.map((roomType) => `${roomType.name}${roomType.quantity > 1 ? ` × ${roomType.quantity}` : ''}`).join(', '),
      room_number: null,
      guest_full_name: customer.full_name,
      check_in_date: checkInDate,
      check_out_date: checkOutDate,
      nights,
      price_per_night: totalPerNight,
      total_amount: totalAmount,
      deposit_amount: 0,
      required_deposit_amount: requiredDepositAmount,
      remaining_balance: totalAmount,
      status: 'PENDING_PAYMENT',
      created_at: booking.created_at,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function checkInBooking({ bookingId, roomAssignments = [], actorUserId = null, idCardFrontImageBuffer = null, idCardFrontImageMimeType = null, idCardBackImageBuffer = null, idCardBackImageMimeType = null }) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    const bookingResult = await transaction.request()
      .input('bookingId', sql.BigInt, Number(bookingId))
      .query(`
        SELECT
          b.id, b.booking_code, b.status, b.check_in_date, b.check_out_date, b.deposit_amount,
          CASE WHEN ${effectiveHoldUntilSql('b')} <= ${hotelNowSql} THEN 1 ELSE 0 END AS hold_expired,
          b.hold_extended,
          deposit_summary.required_deposit_amount, deposit_summary.requires_deposit_payment,
          b.guest_full_name, b.guest_phone,
          guest_identity.id_card_number, guest_identity.id_card_image, guest_identity.id_card_back_image
        FROM bookings b WITH (UPDLOCK, HOLDLOCK)
        OUTER APPLY (
          SELECT
            CEILING(b.total_amount * 0.30) AS required_deposit_amount,
            CASE WHEN EXISTS (
              SELECT 1 FROM dbo.payments p
              WHERE p.booking_id = b.id AND p.payment_type = 'DEPOSIT'
            ) THEN 1 ELSE 0 END AS requires_deposit_payment
        ) deposit_summary
        OUTER APPLY (
          SELECT TOP 1 bg.id_card_number, bg.id_card_image, bg.id_card_back_image
          FROM dbo.booking_guests bg
          WHERE bg.booking_id = b.id
          ORDER BY bg.id
        ) guest_identity
        WHERE b.id = @bookingId;
      `);
    if (!bookingResult.recordset.length) throw new Error('Booking was not found.');
    const booking = bookingResult.recordset[0];
    const staffResult = await transaction.request()
      .input('userId', sql.BigInt, Number(actorUserId))
      .query('SELECT TOP (1) id FROM dbo.staff WITH (UPDLOCK, HOLDLOCK) WHERE user_id = @userId;');
    const checkInStaffId = staffResult.recordset[0]?.id;
    if (!checkInStaffId) throw new Error('Staff profile was not found for check-in user.');
    if (booking.status !== 'CONFIRMED') throw new Error('Booking is not waiting for check-in.');
    if (booking.hold_expired) {
      throw new Error('Booking hold has expired.');
    }
    if (booking.requires_deposit_payment
      && Number(booking.deposit_amount || 0) < Number(booking.required_deposit_amount || 0)) {
      throw new Error('Deposit payment is required before check-in.');
    }

    const today = getHotelDate();
    const checkInDate = new Date(booking.check_in_date).toISOString().slice(0, 10);
    const checkOutDate = new Date(booking.check_out_date).toISOString().slice(0, 10);
    if (today < checkInDate || today >= checkOutDate) {
      throw new Error('Booking is outside its check-in dates.');
    }
    if ((!booking.id_card_image && !idCardFrontImageBuffer)
      || (!booking.id_card_back_image && !idCardBackImageBuffer)) {
      throw new Error('Both CCCD images are required to check in this booking.');
    }
    const bookingRooms = await transaction.request()
      .input('bookingId', sql.BigInt, booking.id)
      .query(`
        SELECT br.id, br.room_id, br.room_type_id, r.status AS room_status
        FROM booking_rooms br WITH (UPDLOCK, HOLDLOCK)
        LEFT JOIN rooms r WITH (UPDLOCK, HOLDLOCK) ON r.id = br.room_id
        WHERE br.booking_id = @bookingId;
      `);
    if (!bookingRooms.recordset.length || !Array.isArray(roomAssignments)
      || roomAssignments.length !== bookingRooms.recordset.length
      || new Set(roomAssignments.map((assignment) => Number(assignment.booking_room_id))).size !== roomAssignments.length
      || new Set(roomAssignments.map((assignment) => Number(assignment.room_id))).size !== roomAssignments.length) {
      throw new Error('Assign a room to every booking room before checking in.');
    }
    const roomSlotsById = new Map(bookingRooms.recordset.map((slot) => [Number(slot.id), slot]));
    for (const assignment of roomAssignments) {
      const slot = roomSlotsById.get(Number(assignment.booking_room_id));
      if (!slot || !Number.isSafeInteger(Number(assignment.room_id)) || Number(assignment.room_id) < 1) {
        throw new Error('Invalid room assignment.');
      }
      const availableRoom = await transaction.request()
        .input('roomId', sql.Int, Number(assignment.room_id))
        .input('roomTypeId', sql.Int, slot.room_type_id)
        .input('bookingId', sql.BigInt, booking.id)
        .input('checkIn', sql.Date, booking.check_in_date)
        .input('checkOut', sql.Date, booking.check_out_date)
        .query(`
          SELECT r.id FROM rooms r WITH (UPDLOCK, HOLDLOCK)
          WHERE r.id = @roomId AND r.room_type_id = @roomTypeId AND r.status = 'AVAILABLE'
            AND NOT EXISTS (
              SELECT 1 FROM booking_rooms br
              JOIN bookings b ON b.id = br.booking_id
              WHERE br.room_id = r.id AND br.booking_id <> @bookingId
                AND ${activeReservationPredicate('b')}
                AND b.check_in_date < @checkOut AND b.check_out_date > @checkIn
            );
        `);
      if (!availableRoom.recordset.length) throw new Error('Selected room is unavailable.');
      await transaction.request()
        .input('bookingRoomId', sql.BigInt, Number(assignment.booking_room_id))
        .input('bookingId', sql.BigInt, booking.id)
        .input('roomId', sql.Int, Number(assignment.room_id))
        .query('UPDATE booking_rooms SET room_id = @roomId WHERE id = @bookingRoomId AND booking_id = @bookingId;');
      slot.room_id = Number(assignment.room_id);
      slot.room_status = 'AVAILABLE';
    }

    await transaction.request()
      .input('bookingId', sql.BigInt, booking.id)
      .input('idCardFrontImage', sql.VarBinary(sql.MAX), idCardFrontImageBuffer)
      .input('idCardFrontImageMimeType', sql.VarChar(50), idCardFrontImageMimeType)
      .input('idCardBackImage', sql.VarBinary(sql.MAX), idCardBackImageBuffer)
      .input('idCardBackImageMimeType', sql.VarChar(50), idCardBackImageMimeType)
      .query(`
        UPDATE booking_guests
        SET id_card_image = COALESCE(@idCardFrontImage, id_card_image),
            id_card_image_mime_type = COALESCE(@idCardFrontImageMimeType, id_card_image_mime_type),
            id_card_back_image = COALESCE(@idCardBackImage, id_card_back_image),
            id_card_back_image_mime_type = COALESCE(@idCardBackImageMimeType, id_card_back_image_mime_type),
            id_card_verified = 1
        WHERE booking_id = @bookingId;
      `);

    await transaction.request()
      .input('bookingId', sql.BigInt, booking.id)
      .input('checkInStaffId', sql.BigInt, checkInStaffId)
      .query(`
        UPDATE booking_rooms
        SET actual_check_in = SYSUTCDATETIME(),
            checked_in_by_staff_id = @checkInStaffId
        WHERE booking_id = @bookingId;

        UPDATE bookings
        SET status = 'CHECKED_IN'
        WHERE id = @bookingId AND status = 'CONFIRMED';
      `);
    for (const room of bookingRooms.recordset) {
      await transaction.request()
        .input('roomId', sql.Int, room.room_id)
        .query(`
          UPDATE rooms
          SET status = 'OCCUPIED'
          WHERE id = @roomId AND status = 'AVAILABLE';
        `);
    }

    await transaction.commit();
    return { booking_id: booking.id, booking_code: booking.booking_code, status: 'CHECKED_IN' };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function getRecentBookings(limit = 10, activeOnly = false, customerId = null, bookingId = null, reconcileState = true, serviceableOnly = false) {
  if (reconcileState) await expireStaleBookings();
  const pool = await getPool();

  if (reconcileState) await pool.request().query(`
    UPDATE rooms
    SET status = 'OCCUPIED'
    WHERE EXISTS (
      SELECT 1 FROM booking_rooms br
      JOIN bookings b ON b.id = br.booking_id
      WHERE br.room_id = rooms.id AND b.status = 'CHECKED_IN'
    ) AND status <> 'OCCUPIED';
  `);

  const request = pool.request();
  const limitClause = Number.isInteger(limit) && limit > 0 ? 'TOP (@limit)' : '';
  if (limitClause) request.input('limit', sql.Int, limit);
  const filters = [];
  if (serviceableOnly) filters.push(`b.status = 'CHECKED_IN'`);
  if (activeOnly) filters.push(`(
    b.status = 'CHECKED_IN'
    OR (b.status = 'CONFIRMED' AND (${effectiveHoldUntilSql('b')} > ${hotelNowSql}
      OR EXISTS (SELECT 1 FROM dbo.booking_rooms hold_br JOIN dbo.rooms hold_room ON hold_room.id = hold_br.room_id
        WHERE hold_br.booking_id = b.id AND hold_room.status = 'OCCUPIED')))
    OR (b.status = 'CHECKED_OUT' AND b.total_amount > b.deposit_amount + COALESCE(payment_summary.final_paid_amount, 0))
  )`);
  if (customerId !== null) {
    request.input('customerId', sql.BigInt, Number(customerId));
    filters.push('b.customer_id = @customerId');
  }
  if (bookingId !== null) {
    request.input('bookingId', sql.BigInt, Number(bookingId));
    filters.push('b.id = @bookingId');
  }
  const activeFilter = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const result = await request.query(`
      SELECT ${limitClause}
        b.id,
        b.booking_code,
        b.guest_full_name,
        b.guest_phone,
        b.guest_email,
        CONVERT(varchar(10), b.check_in_date, 23) AS check_in_date,
        b.check_out_date,
        b.adults,
        b.children,
        b.status,
        b.total_amount,
        b.deposit_amount,
        deposit_summary.required_deposit_amount,
        deposit_summary.requires_deposit_payment,
        CASE
          WHEN deposit_summary.required_deposit_amount = 0 THEN 'NOT_REQUIRED'
          WHEN COALESCE(b.deposit_amount, 0) >= deposit_summary.required_deposit_amount THEN 'PAID'
          WHEN COALESCE(payment_summary.has_pending_deposit_payment, 0) = 1 THEN 'PENDING'
          WHEN COALESCE(b.deposit_amount, 0) > 0 THEN 'PARTIAL'
          WHEN COALESCE(payment_summary.has_failed_deposit_payment, 0) = 1 THEN 'FAILED'
          ELSE 'UNPAID'
        END AS deposit_payment_status,
        COALESCE(payment_summary.final_paid_amount, 0) AS final_paid_amount,
        COALESCE(payment_summary.has_pending_final_payment, 0) AS has_pending_final_payment,
        CONVERT(varchar(33), b.created_at, 126) + '+07:00' AS created_at,
        CONVERT(varchar(33), DATEADD(minute, 15, b.created_at), 126) + '+07:00' AS payment_expires_at,
        CONVERT(varchar(33), ${effectiveHoldUntilSql('b')}, 126) + '+07:00' AS hold_until,
        b.hold_extended,
        CASE WHEN COALESCE(hold_extension_summary.extension_count, 0) < CASE WHEN b.hold_extended = 1 THEN 1 ELSE 0 END
          THEN CASE WHEN b.hold_extended = 1 THEN 1 ELSE 0 END
          ELSE COALESCE(hold_extension_summary.extension_count, 0) END AS hold_extension_count,
        CONVERT(varchar(33), b.expected_arrival_at, 126) + '+07:00' AS expected_arrival_at,
        b.cancellation_reason,
        b.cancellation_reason_code,
        b.cancellation_reason_note,
        b.cancelled_at,
        b.cancelled_by,
        b.special_request,
        type_summary.room_type_name,
        type_summary.room_type_id,
        room_summary.room_number,
        room_summary.assigned_room_id,
        room_summary.room_status,
        room_selection_summary.room_selections,
        CASE WHEN EXISTS (
          SELECT 1 FROM dbo.booking_guests bg
          WHERE bg.booking_id = b.id AND bg.id_card_image IS NOT NULL
        ) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS has_guest_id_card,
        CASE WHEN EXISTS (
          SELECT 1 FROM dbo.booking_guests bg
          WHERE bg.booking_id = b.id AND bg.id_card_back_image IS NOT NULL
        ) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS has_guest_id_card_back
      FROM bookings b
      OUTER APPLY (
        SELECT MIN(type_counts.room_type_id) AS room_type_id,
          STRING_AGG(type_counts.type_label, ', ') AS room_type_name
        FROM (
          SELECT rt2.id AS room_type_id,
            CONCAT(rt2.name, CASE WHEN COUNT(*) > 1 THEN CONCAT(' × ', COUNT(*)) ELSE '' END) AS type_label
          FROM booking_rooms br2
          JOIN room_types rt2 ON rt2.id = br2.room_type_id
          WHERE br2.booking_id = b.id
          GROUP BY rt2.id, rt2.name
        ) type_counts
      ) type_summary
      OUTER APPLY (
        SELECT (
          SELECT br.room_type_id, rt.name AS room_type_name, COUNT(*) AS quantity,
            MIN(br.price_per_night) AS price_per_night,
            SUM(br.price_per_night) AS total_price_per_night,
            (SELECT TOP 1 rti.image_url
             FROM dbo.room_type_images rti
             WHERE rti.room_type_id = rt.id AND rti.is_primary = 1
             ORDER BY rti.id) AS image_url
          FROM dbo.booking_rooms br
          JOIN dbo.room_types rt ON rt.id = br.room_type_id
          WHERE br.booking_id = b.id
          GROUP BY br.room_type_id, rt.id, rt.name
          FOR JSON PATH
        ) AS room_selections
      ) room_selection_summary
      OUTER APPLY (
        SELECT
          SUM(CASE WHEN p.payment_type = 'FINAL' AND p.status = 'SUCCESS' THEN p.amount ELSE 0 END) AS final_paid_amount,
          MAX(CASE WHEN p.payment_type = 'FINAL' AND p.status = 'PENDING' THEN 1 ELSE 0 END) AS has_pending_final_payment,
          MAX(CASE WHEN p.payment_type = 'DEPOSIT' AND p.status = 'PENDING' THEN 1 ELSE 0 END) AS has_pending_deposit_payment,
          MAX(CASE WHEN p.payment_type = 'DEPOSIT' AND p.status = 'FAILED' THEN 1 ELSE 0 END) AS has_failed_deposit_payment
        FROM dbo.payments p
        WHERE p.booking_id = b.id
      ) payment_summary
      OUTER APPLY (
        SELECT
          CEILING(b.total_amount * 0.30) AS required_deposit_amount,
          CASE WHEN EXISTS (
            SELECT 1 FROM dbo.payments p
            WHERE p.booking_id = b.id AND p.payment_type = 'DEPOSIT'
          ) THEN 1 ELSE 0 END AS requires_deposit_payment
      ) deposit_summary
      OUTER APPLY (
        SELECT COUNT(*) AS extension_count
        FROM dbo.booking_hold_events bhe
        WHERE bhe.booking_id = b.id AND bhe.event_type = 'EXTENDED'
      ) hold_extension_summary
      OUTER APPLY (
        SELECT MIN(r.id) AS assigned_room_id,
          STRING_AGG(CAST(r.room_number AS nvarchar(max)), ', ') AS room_number,
          MIN(r.status) AS room_status
        FROM booking_rooms br3
        LEFT JOIN rooms r ON r.id = br3.room_id
        WHERE br3.booking_id = b.id
      ) room_summary
      ${activeFilter}
      ORDER BY b.id DESC;
    `);

  return result.recordset.map((item) => {
    const holdFields = serializeBookingHoldFields({
      status: item.status,
      createdAt: item.created_at,
      checkInDate: item.check_in_date,
      holdUntil: item.hold_until,
      holdExtended: Boolean(item.hold_extended),
      expectedArrivalAt: item.expected_arrival_at,
    });
    return ({
    id: item.id,
    booking_code: item.booking_code,
    guest_full_name: item.guest_full_name,
    guest_phone: item.guest_phone,
    guest_email: item.guest_email,
    check_in_date: item.check_in_date,
    check_out_date: item.check_out_date,
    adults: item.adults,
    children: item.children,
    status: item.status,
    total_amount: Number(item.total_amount ?? 0),
    deposit_amount: Number(item.deposit_amount ?? 0),
    required_deposit_amount: Number(item.required_deposit_amount ?? 0),
    requires_deposit_payment: Boolean(item.requires_deposit_payment),
    deposit_payment_status: item.deposit_payment_status,
    final_paid_amount: Number(item.final_paid_amount ?? 0),
    balance_due: Math.max(0, Number(item.total_amount ?? 0) - Number(item.deposit_amount ?? 0) - Number(item.final_paid_amount ?? 0)),
    has_pending_final_payment: Boolean(item.has_pending_final_payment),
    ...holdFields,
    payment_expires_at: item.payment_expires_at,
    hold_extended: Boolean(item.hold_extended),
    hold_extension_count: Number(item.hold_extension_count ?? (item.hold_extended ? 1 : 0)),
    expected_arrival_at: item.expected_arrival_at,
    cancellation_reason: item.cancellation_reason,
    cancellation_reason_code: item.status === 'CANCELLED' ? getCancellationReasonCode(item.cancellation_reason_code, item.cancellation_reason) : null,
    cancellation_reason_label: item.status === 'CANCELLED' ? getCancellationReasonLabel(getCancellationReasonCode(item.cancellation_reason_code, item.cancellation_reason)) : null,
    cancellation_reason_note: item.status === 'CANCELLED' ? item.cancellation_reason_note : null,
    cancelled_at: item.status === 'CANCELLED' ? item.cancelled_at : null,
    cancelled_by: item.status === 'CANCELLED' && item.cancelled_by != null ? Number(item.cancelled_by) : null,
    special_request: item.special_request,
    room_type_name: item.room_type_name,
    room_type_id: item.room_type_id,
    room_selections: item.room_selections ? JSON.parse(item.room_selections) : [],
    room_number: item.room_number,
    assigned_room_id: item.assigned_room_id,
    room_status: item.room_status,
    has_guest_id_card: Boolean(item.has_guest_id_card),
    has_guest_id_card_back: Boolean(item.has_guest_id_card_back),
  });
  });
}

async function getBookingDetails(bookingId, customerId = null) {
  await expireStaleBookings();
  const rows = await getRecentBookings(null, false, customerId, bookingId, false);
  return rows[0] ?? null;
}

async function getActiveBookings() {
  return getRecentBookings(null, true);
}

async function getInHouseBookings() {
  return getRecentBookings(null, false, null, null, true, true);
}

async function updateBooking({ bookingId, customerId, ...changes }) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const request = transaction.request().input('bookingId', sql.BigInt, Number(bookingId));
    const ownerFilter = customerId == null ? '' : 'AND b.customer_id = @customerId';
    if (customerId != null) request.input('customerId', sql.BigInt, Number(customerId));
    const currentResult = await request.query(`
      SELECT b.id, b.customer_id, b.status, b.check_in_date, b.check_out_date, b.deposit_amount,
        b.guest_full_name, b.guest_phone, b.guest_email
      FROM bookings b WITH (UPDLOCK, HOLDLOCK)
      WHERE b.id = @bookingId ${ownerFilter};
    `);
    const current = currentResult.recordset[0];
    if (!current) throw new Error('Booking not found.');
    if (current.status !== 'CONFIRMED') throw new Error('Only confirmed bookings can be updated.');
    if (changes.checkOutDate <= changes.checkInDate) throw new Error('Check-out must be after check-in.');
    if (customerId != null) {
      const currentDateResult = await transaction.request().query(`
        SELECT CONVERT(date, DATEADD(hour, 7, SYSUTCDATETIME())) AS vietnam_today;
      `);
      const vietnamToday = currentDateResult.recordset[0].vietnam_today.toISOString().slice(0, 10);
      if (changes.checkInDate < vietnamToday) throw new Error('Check-in date cannot be in the past.');
      const cutoffResult = await transaction.request()
        .input('currentCheckIn', sql.Date, current.check_in_date)
        .input('newCheckIn', sql.Date, changes.checkInDate)
        .query(`
          SELECT
            CASE WHEN SYSUTCDATETIME() <= DATEADD(hour, 7, CONVERT(datetime2, DATEADD(day, -1, @currentCheckIn)))
              THEN 1 ELSE 0 END AS may_change_current,
            CASE WHEN SYSUTCDATETIME() <= DATEADD(hour, 7, CONVERT(datetime2, DATEADD(day, -1, @newCheckIn)))
              THEN 1 ELSE 0 END AS may_change_to_new_date;
        `);
      if (!cutoffResult.recordset[0]?.may_change_current || !cutoffResult.recordset[0]?.may_change_to_new_date) {
        throw new Error('Customers can only update a booking at least 24 hours before check-in.');
      }
    }

    const existingRoomsResult = await transaction.request()
      .input('bookingId', sql.BigInt, Number(bookingId))
      .query('SELECT id, room_type_id, room_id, price_per_night FROM booking_rooms WHERE booking_id = @bookingId ORDER BY id;');
    const existingRooms = existingRoomsResult.recordset;
    const existingQuantities = new Map();
    for (const room of existingRooms) {
      existingQuantities.set(room.room_type_id, (existingQuantities.get(room.room_type_id) || 0) + 1);
    }
    const requestedSelections = changes.roomSelections == null
      ? [...existingQuantities.entries()].map(([roomTypeId, quantity]) => ({ roomTypeId, quantity }))
      : [...changes.roomSelections.reduce((quantities, selection) => {
        const roomTypeId = Number(selection.roomTypeId);
        quantities.set(roomTypeId, (quantities.get(roomTypeId) || 0) + Number(selection.quantity));
        return quantities;
      }, new Map()).entries()].map(([roomTypeId, quantity]) => ({ roomTypeId, quantity }));
    const requestedRoomCount = requestedSelections.reduce((sum, selection) => sum + selection.quantity, 0);
    if (!requestedSelections.length || requestedRoomCount < existingRooms.length) {
      throw new Error('Room selection quantities cannot be fewer than the existing number of rooms.');
    }
    const selectedRooms = [];
    let totalPerNight = 0;
    let totalCapacityAdults = 0;
    let totalCapacityChildren = 0;
    for (const selection of requestedSelections) {
      const roomTypeResult = await transaction.request()
        .input('roomTypeId', sql.Int, selection.roomTypeId)
        .query(`
          SELECT id, name, base_price, max_adults, max_children
          FROM dbo.room_types WHERE id = @roomTypeId;
        `);
      const roomType = roomTypeResult.recordset[0];
      if (!roomType) throw new Error('Selected room type was not found.');
      const inventoryResult = await transaction.request()
        .input('roomTypeId', sql.Int, selection.roomTypeId)
        .input('bookingId', sql.BigInt, Number(bookingId))
        .input('checkIn', sql.Date, changes.checkInDate)
        .input('checkOut', sql.Date, changes.checkOutDate)
        .query(`
          SELECT
            (SELECT COUNT(*) FROM rooms WHERE room_type_id = @roomTypeId AND status <> 'MAINTENANCE') AS inventory_count,
            (SELECT COUNT(*) FROM booking_rooms br JOIN bookings b ON b.id = br.booking_id
             WHERE br.room_type_id = @roomTypeId AND b.id <> @bookingId AND ${activeReservationPredicate('b')}
               AND b.check_in_date < @checkOut AND b.check_out_date > @checkIn) AS reserved_count;
        `);
      const inventory = inventoryResult.recordset[0];
      if (!inventory || Number(inventory.inventory_count) - Number(inventory.reserved_count) < selection.quantity) {
        throw new Error(`Not enough rooms available for ${roomType.name} on those dates.`);
      }
      const oldRoomsOfType = existingRooms.filter((room) => room.room_type_id === selection.roomTypeId);
      for (let index = 0; index < selection.quantity; index += 1) {
        const previousRoom = oldRoomsOfType[index];
        const pricePerNight = previousRoom
          ? Number(previousRoom.price_per_night ?? roomType.base_price)
          : Number(roomType.base_price);
        selectedRooms.push({ roomTypeId: selection.roomTypeId, pricePerNight });
        totalPerNight += pricePerNight;
        totalCapacityAdults += Number(roomType.max_adults);
        totalCapacityChildren += Number(roomType.max_children);
      }
    }
    if (Number(changes.adults) > totalCapacityAdults || Number(changes.children) > totalCapacityChildren) {
      throw new Error('Guest count exceeds the selected rooms capacity.');
    }

    const nights = calculateNights(changes.checkInDate, changes.checkOutDate);
    const chargesResult = await transaction.request()
      .input('bookingId', sql.BigInt, Number(bookingId))
      .query(`
        SELECT COALESCE(SUM(bs.quantity * bs.unit_price), 0) AS service_total
        FROM booking_services bs
        JOIN booking_rooms br ON br.id = bs.booking_room_id
        WHERE br.booking_id = @bookingId;
      `);
    const totalAmount = totalPerNight * nights + Number(chargesResult.recordset[0].service_total ?? 0);
    for (let index = 0; index < existingRooms.length; index += 1) {
      const existingRoom = existingRooms[index];
      const selectedRoom = selectedRooms[index];
      await transaction.request()
        .input('bookingRoomId', sql.BigInt, existingRoom.id)
        .input('bookingId', sql.BigInt, Number(bookingId))
        .input('roomTypeId', sql.Int, selectedRoom.roomTypeId)
        .input('pricePerNight', sql.Decimal(12, 2), selectedRoom.pricePerNight)
        .input('checkIn', sql.Date, changes.checkInDate)
        .input('checkOut', sql.Date, changes.checkOutDate)
        .query(`
          UPDATE dbo.booking_rooms
          SET room_type_id = @roomTypeId,
            price_per_night = @pricePerNight,
            room_id = CASE
              WHEN room_type_id = @roomTypeId
                AND room_id IS NOT NULL
                AND EXISTS (
                  SELECT 1 FROM dbo.rooms r
                  WHERE r.id = dbo.booking_rooms.room_id
                    AND r.status NOT IN ('MAINTENANCE', 'CLEANING')
                    AND NOT EXISTS (
                      SELECT 1 FROM dbo.booking_rooms other_br
                      JOIN dbo.bookings other_b ON other_b.id = other_br.booking_id
                      WHERE other_br.room_id = dbo.booking_rooms.room_id
                        AND other_br.booking_id <> @bookingId
                        AND ${activeReservationPredicate('other_b')}
                        AND other_b.check_in_date < @checkOut
                        AND other_b.check_out_date > @checkIn
                    )
                )
              THEN room_id ELSE NULL END
          WHERE id = @bookingRoomId AND booking_id = @bookingId;
        `);
    }
    for (let index = existingRooms.length; index < selectedRooms.length; index += 1) {
      const selectedRoom = selectedRooms[index];
      await transaction.request()
        .input('bookingId', sql.BigInt, Number(bookingId))
        .input('roomTypeId', sql.Int, selectedRoom.roomTypeId)
        .input('pricePerNight', sql.Decimal(12, 2), selectedRoom.pricePerNight)
        .query(`
          INSERT INTO dbo.booking_rooms (booking_id, room_type_id, room_id, price_per_night)
          VALUES (@bookingId, @roomTypeId, NULL, @pricePerNight);
        `);
    }
    await transaction.request()
      .input('bookingId', sql.BigInt, Number(bookingId))
      .input('checkInDate', sql.Date, changes.checkInDate)
      .input('checkOutDate', sql.Date, changes.checkOutDate)
      .input('guestName', sql.NVarChar(150), changes.guestFullName.trim())
      .input('guestPhone', sql.VarChar(20), changes.guestPhone.trim())
      .input('guestEmail', sql.VarChar(150), changes.guestEmail?.trim() || null)
      .input('adults', sql.TinyInt, Number(changes.adults))
      .input('children', sql.TinyInt, Number(changes.children))
      .input('specialRequest', sql.NVarChar(500), changes.specialRequest?.trim() || null)
      .input('totalAmount', sql.Decimal(12, 2), totalAmount)
      .query(`
        UPDATE bookings SET check_in_date = @checkInDate, check_out_date = @checkOutDate,
          guest_full_name = @guestName, guest_phone = @guestPhone, guest_email = @guestEmail,
          adults = @adults, children = @children, special_request = @specialRequest,
          total_amount = @totalAmount,
          hold_until = CASE WHEN hold_extended = 1 AND expected_arrival_at IS NOT NULL
            THEN DATEADD(hour, 4, expected_arrival_at)
            ELSE DATEADD(hour, 4, CASE WHEN created_at > DATEADD(hour, 14, CONVERT(datetime2, @checkInDate))
              THEN created_at ELSE DATEADD(hour, 14, CONVERT(datetime2, @checkInDate)) END) END,
          expected_arrival_at = CASE WHEN hold_extended = 1 THEN expected_arrival_at ELSE NULL END
        WHERE id = @bookingId;
        UPDATE booking_guests SET full_name = @guestName, phone = @guestPhone WHERE booking_id = @bookingId;
      `);
    await transaction.commit();
    return {
      booking_id: bookingId,
      check_in_date: changes.checkInDate,
      check_out_date: changes.checkOutDate,
      total_amount: totalAmount,
      deposit_amount: Number(current.deposit_amount ?? 0),
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function getStayExtensionBilling(bookingId) {
  const pool = await getPool();
  const bookingResult = await pool.request()
    .input('bookingId', sql.BigInt, Number(bookingId))
    .query(`
      SELECT b.id, b.booking_code, b.status, b.check_in_date, b.check_out_date,
        b.total_amount, b.original_total_amount, b.discount_amount, b.deposit_amount
      FROM dbo.bookings b WHERE b.id = @bookingId;
    `);
  const booking = bookingResult.recordset[0];
  if (!booking) throw new Error('BOOKING_NOT_FOUND');
  if (booking.status !== 'CHECKED_IN') throw new Error('BOOKING_NOT_CHECKED_IN');

  const invoiceResult = await pool.request()
    .input('bookingId', sql.BigInt, Number(bookingId))
    .query(`
      SELECT TOP (1) i.id, i.invoice_number, i.room_amount, i.service_amount,
        i.discount_amount, i.tax_amount, i.total_amount, i.deposit_paid,
        i.amount_due, i.status, i.issued_at,
        JSON_QUERY((SELECT ii.item_type, ii.description, ii.quantity, ii.unit_price, ii.amount
          FROM dbo.invoice_items ii WHERE ii.invoice_id = i.id ORDER BY ii.id FOR JSON PATH)) AS items
      FROM dbo.invoices i
      WHERE i.booking_id = @bookingId
      ORDER BY i.id DESC;
    `);
  if (invoiceResult.recordset[0]) {
    const invoice = invoiceResult.recordset[0];
    return {
      billing_type: 'INVOICE',
      invoice: {
        ...invoice,
        id: Number(invoice.id),
        room_amount: Number(invoice.room_amount || 0),
        service_amount: Number(invoice.service_amount || 0),
        discount_amount: Number(invoice.discount_amount || 0),
        tax_amount: Number(invoice.tax_amount || 0),
        total_amount: Number(invoice.total_amount || 0),
        deposit_paid: Number(invoice.deposit_paid || 0),
        amount_due: Number(invoice.amount_due || 0),
        items: (invoice.items ? (Array.isArray(invoice.items) ? invoice.items : JSON.parse(invoice.items)) : []).map((item) => ({
          ...item,
          quantity: Number(item.quantity || 0),
          unit_price: Number(item.unit_price || 0),
          amount: Number(item.amount || 0),
        })),
      },
      estimate: null,
    };
  }

  const [roomResult, serviceResult, paymentResult] = await Promise.all([
    pool.request().input('bookingId', sql.BigInt, Number(bookingId)).query(`
      SELECT rt.name AS room_type_name, r.room_number, br.price_per_night,
        DATEDIFF(day, b.check_in_date, b.check_out_date) AS quantity,
        br.price_per_night * DATEDIFF(day, b.check_in_date, b.check_out_date) AS amount
      FROM dbo.booking_rooms br
      JOIN dbo.bookings b ON b.id = br.booking_id
      JOIN dbo.room_types rt ON rt.id = br.room_type_id
      LEFT JOIN dbo.rooms r ON r.id = br.room_id
      WHERE br.booking_id = @bookingId ORDER BY br.id;
    `),
    pool.request().input('bookingId', sql.BigInt, Number(bookingId)).query(`
      SELECT s.name AS description, bs.quantity, bs.unit_price,
        bs.quantity * bs.unit_price AS amount
      FROM dbo.booking_services bs
      JOIN dbo.booking_rooms br ON br.id = bs.booking_room_id
      JOIN dbo.services s ON s.id = bs.service_id
      WHERE br.booking_id = @bookingId ORDER BY bs.id;
    `),
    pool.request().input('bookingId', sql.BigInt, Number(bookingId)).query(`
      SELECT COALESCE(SUM(CASE WHEN payment_type = 'FINAL' AND status = 'SUCCESS' THEN amount ELSE 0 END), 0) AS final_paid_amount
      FROM dbo.payments WHERE booking_id = @bookingId;
    `),
  ]);
  const items = [
    ...roomResult.recordset.map((item) => ({
      item_type: 'ROOM',
      description: `${item.room_type_name} - ${item.room_number || 'Chưa xếp'}`,
      quantity: Number(item.quantity || 0),
      unit_price: Number(item.price_per_night || 0),
      amount: Number(item.amount || 0),
    })),
    ...serviceResult.recordset.map((item) => ({
      item_type: 'SERVICE',
      description: item.description,
      quantity: Number(item.quantity || 0),
      unit_price: Number(item.unit_price || 0),
      amount: Number(item.amount || 0),
    })),
  ];
  const totalAmount = Number(booking.total_amount || 0);
  const paidAmount = Number(booking.deposit_amount || 0) + Number(paymentResult.recordset[0]?.final_paid_amount || 0);
  return {
    billing_type: 'ESTIMATE',
    invoice: null,
    estimate: {
      check_in_date: booking.check_in_date,
      check_out_date: booking.check_out_date,
      room_amount: items.filter((item) => item.item_type === 'ROOM').reduce((sum, item) => sum + item.amount, 0),
      service_amount: items.filter((item) => item.item_type === 'SERVICE').reduce((sum, item) => sum + item.amount, 0),
      discount_amount: Number(booking.discount_amount || 0),
      tax_amount: 0,
      total_amount: totalAmount,
      paid_amount: paidAmount,
      amount_due: Math.max(0, totalAmount - paidAmount),
    },
    items,
  };
}

async function extendCheckedInBooking({ bookingId, expectedCheckOutDate, newCheckOutDate, note = null, performedByUserId = null }) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const id = Number(bookingId);
    const bookingResult = await transaction.request()
      .input('bookingId', sql.BigInt, id)
      .query(`
        SELECT id, booking_code, status, check_in_date, check_out_date, total_amount,
          original_total_amount, discount_amount, deposit_amount
        FROM dbo.bookings WITH (UPDLOCK, HOLDLOCK)
        WHERE id = @bookingId;
      `);
    const booking = bookingResult.recordset[0];
    if (!booking) throw new Error('BOOKING_NOT_FOUND');
    if (booking.status !== 'CHECKED_IN') throw new Error('BOOKING_NOT_CHECKED_IN');
    const currentCheckOutDate = booking.check_out_date.toISOString().slice(0, 10);
    if (!expectedCheckOutDate || expectedCheckOutDate !== currentCheckOutDate) throw new Error('BOOKING_CHANGED');

    const roomResult = await transaction.request()
      .input('bookingId', sql.BigInt, id)
      .query(`
        SELECT br.id, br.room_type_id, br.room_id, br.price_per_night, rt.name AS room_type_name, r.room_number,
          r.room_type_id AS assigned_room_type_id,
          r.status AS room_status,
          CASE WHEN EXISTS (
            SELECT 1 FROM dbo.room_problem_reports report
            WHERE report.room_id = r.id AND report.status = 'OPEN'
          ) THEN 1 ELSE 0 END AS has_open_maintenance_report
        FROM dbo.booking_rooms br WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.room_types rt ON rt.id = br.room_type_id
        LEFT JOIN dbo.rooms r ON r.id = br.room_id
        WHERE br.booking_id = @bookingId
        ORDER BY br.id;
      `);
    const rooms = roomResult.recordset;
    if (!rooms.length || rooms.some((room) => !room.room_id)) throw new Error('BOOKING_ROOM_NOT_ASSIGNED');
    if (rooms.some((room) => Number(room.assigned_room_type_id) !== Number(room.room_type_id)
      || String(room.room_status).toUpperCase() === 'MAINTENANCE' || room.has_open_maintenance_report)) {
      throw new Error('ROOM_UNAVAILABLE_FOR_EXTENSION');
    }

    if (newCheckOutDate <= currentCheckOutDate) throw new Error('INVALID_EXTENSION_DATE');
    const nightsAdded = Math.round((Date.parse(`${newCheckOutDate}T00:00:00Z`) - Date.parse(`${currentCheckOutDate}T00:00:00Z`)) / 86400000);
    if (!Number.isSafeInteger(nightsAdded) || nightsAdded < 1) throw new Error('INVALID_EXTENSION_DATE');

    const roomTypeCounts = new Map();
    for (const room of rooms) roomTypeCounts.set(room.room_type_id, (roomTypeCounts.get(room.room_type_id) || 0) + 1);
    for (const [roomTypeId, ownRoomCount] of roomTypeCounts) {
      const capacity = await transaction.request()
        .input('roomTypeId', sql.Int, roomTypeId)
        .input('bookingId', sql.BigInt, id)
        .input('newCheckOutDate', sql.Date, newCheckOutDate)
        .input('currentCheckOutDate', sql.Date, currentCheckOutDate)
        .query(`
          WITH extension_nights AS (
            SELECT @currentCheckOutDate AS night_start
            UNION
            SELECT other_b.check_in_date
            FROM dbo.booking_rooms other_br
            JOIN dbo.bookings other_b ON other_b.id = other_br.booking_id
            WHERE other_br.room_type_id = @roomTypeId AND other_br.booking_id <> @bookingId
              AND ${activeReservationPredicate('other_b')}
              AND other_b.check_in_date >= @currentCheckOutDate
              AND other_b.check_in_date < @newCheckOutDate
          ), inventory AS (
            SELECT COUNT(*) AS inventory_count
            FROM dbo.rooms WITH (UPDLOCK, HOLDLOCK)
            WHERE room_type_id = @roomTypeId AND status <> 'MAINTENANCE'
          ), nightly_counts AS (
            SELECT nights.night_start,
              (SELECT COUNT(*) FROM dbo.booking_rooms other_br WITH (UPDLOCK, HOLDLOCK)
               JOIN dbo.bookings other_b WITH (UPDLOCK, HOLDLOCK) ON other_b.id = other_br.booking_id
               WHERE other_br.room_type_id = @roomTypeId AND other_br.booking_id <> @bookingId
                 AND ${activeReservationPredicate('other_b')}
                 AND other_b.check_in_date <= nights.night_start
                 AND other_b.check_out_date > nights.night_start) AS reserved_count
            FROM extension_nights nights
          )
          SELECT inventory.inventory_count,
            COALESCE(MAX(nightly_counts.reserved_count), 0) AS max_reserved_count
          FROM inventory
          LEFT JOIN nightly_counts ON 1 = 1
          GROUP BY inventory.inventory_count;
        `);
      const result = capacity.recordset[0];
      if (!result || Number(result.inventory_count) < ownRoomCount + Number(result.max_reserved_count)) {
        const roomTypeName = rooms.find((room) => room.room_type_id === roomTypeId)?.room_type_name || '';
        throw new Error(`ROOM_TYPE_EXTENSION_CONFLICT:${roomTypeName}`);
      }
    }

    const conflict = await transaction.request()
      .input('bookingId', sql.BigInt, id)
      .input('newCheckOutDate', sql.Date, newCheckOutDate)
      .input('currentCheckOutDate', sql.Date, currentCheckOutDate)
      .query(`
        SELECT TOP (1) other_b.booking_code, r.room_number
        FROM dbo.booking_rooms current_br WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.booking_rooms other_br WITH (UPDLOCK, HOLDLOCK) ON other_br.room_id = current_br.room_id
        JOIN dbo.bookings other_b WITH (UPDLOCK, HOLDLOCK) ON other_b.id = other_br.booking_id
        LEFT JOIN dbo.rooms r ON r.id = current_br.room_id
        WHERE current_br.booking_id = @bookingId
          AND other_br.booking_id <> @bookingId
          AND ${activeReservationPredicate('other_b')}
          AND other_b.check_in_date < @newCheckOutDate
          AND other_b.check_out_date > @currentCheckOutDate;
      `);
    if (conflict.recordset.length) throw new Error(`ROOM_EXTENSION_CONFLICT:${conflict.recordset[0].room_number || ''}`);

    const pricePerNight = rooms.reduce((sum, room) => sum + Number(room.price_per_night || 0), 0);
    if (!Number.isFinite(pricePerNight) || pricePerNight <= 0) throw new Error('ROOM_PRICE_NOT_FOUND');
    const extensionAmount = pricePerNight * nightsAdded;
    const newTotalAmount = Number(booking.total_amount) + extensionAmount;
    const newOriginalTotalAmount = Number(booking.original_total_amount ?? Number(booking.total_amount) + Number(booking.discount_amount || 0)) + extensionAmount;

    const paymentState = await transaction.request()
      .input('bookingId', sql.BigInt, id)
      .query(`
        SELECT
          MAX(CASE WHEN payment_type = 'FINAL' AND status = 'PENDING' THEN 1 ELSE 0 END) AS has_pending_final,
          COALESCE(SUM(CASE WHEN payment_type = 'FINAL' AND status = 'SUCCESS' THEN amount ELSE 0 END), 0) AS final_paid_amount
        FROM dbo.payments WITH (UPDLOCK, HOLDLOCK)
        WHERE booking_id = @bookingId;
      `);
    const finalPaidAmount = Number(paymentState.recordset[0]?.final_paid_amount || 0);
    if (paymentState.recordset[0]?.has_pending_final) throw new Error('PENDING_FINAL_PAYMENT');

    await transaction.request()
      .input('bookingId', sql.BigInt, id)
      .input('newCheckOutDate', sql.Date, newCheckOutDate)
      .input('newTotalAmount', sql.Decimal(12, 2), newTotalAmount)
      .input('newOriginalTotalAmount', sql.Decimal(12, 2), newOriginalTotalAmount)
      .query(`
        UPDATE dbo.bookings
        SET check_out_date = @newCheckOutDate,
            total_amount = @newTotalAmount,
            original_total_amount = @newOriginalTotalAmount
        WHERE id = @bookingId AND status = 'CHECKED_IN';
      `);

    await transaction.request()
      .input('bookingId', sql.BigInt, id)
      .input('previousCheckOutDate', sql.Date, currentCheckOutDate)
      .input('newCheckOutDate', sql.Date, newCheckOutDate)
      .input('nightsAdded', sql.Int, nightsAdded)
      .input('pricePerNight', sql.Decimal(12, 2), pricePerNight)
      .input('amount', sql.Decimal(12, 2), extensionAmount)
      .input('note', sql.NVarChar(255), note || null)
      .input('performedByUserId', sql.BigInt, performedByUserId || null)
      .query(`
        INSERT INTO dbo.booking_extensions
          (booking_id, previous_check_out_date, new_check_out_date, nights_added, price_per_night, amount, note, performed_by_user_id)
        VALUES (@bookingId, @previousCheckOutDate, @newCheckOutDate, @nightsAdded, @pricePerNight, @amount, @note, @performedByUserId);
      `);

    await transaction.commit();
    return {
      booking_id: id,
      booking_code: booking.booking_code,
      check_out_date: newCheckOutDate,
      status: 'CHECKED_IN',
      nights_added: nightsAdded,
      price_per_night: pricePerNight,
      extension_amount: extensionAmount,
      total_amount: newTotalAmount,
      paid_amount: Number(booking.deposit_amount || 0) + finalPaidAmount,
      balance_due: Math.max(0, newTotalAmount - Number(booking.deposit_amount || 0) - finalPaidAmount),
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function extendBookingHold({ bookingId, expectedArrivalAt, reason, performedByUserId }) {
  const normalizedReason = String(reason ?? '').trim();
  const arrival = new Date(expectedArrivalAt);
  if (!Number.isFinite(arrival.getTime())) throw new Error('A valid expected arrival time is required.');
  if (normalizedReason.length < 3 || normalizedReason.length > 500) throw new Error('A reason between 3 and 500 characters is required.');

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const currentResult = await transaction.request()
      .input('bookingId', sql.BigInt, Number(bookingId))
      .query(`
        SELECT b.id, b.status, b.hold_extended,
          CONVERT(varchar(33), ${effectiveHoldUntilSql('b')}, 126) + '+07:00' AS hold_until,
          CASE WHEN ${effectiveHoldUntilSql('b')} <= ${hotelNowSql} THEN 1 ELSE 0 END AS hold_expired,
          CASE WHEN (SELECT COUNT(*) FROM dbo.booking_hold_events bhe WITH (HOLDLOCK)
           WHERE bhe.booking_id = b.id AND bhe.event_type = 'EXTENDED') < CASE WHEN b.hold_extended = 1 THEN 1 ELSE 0 END
            THEN CASE WHEN b.hold_extended = 1 THEN 1 ELSE 0 END
            ELSE (SELECT COUNT(*) FROM dbo.booking_hold_events bhe WITH (HOLDLOCK)
              WHERE bhe.booking_id = b.id AND bhe.event_type = 'EXTENDED') END AS hold_extension_count
        FROM dbo.bookings b WITH (UPDLOCK, HOLDLOCK)
        WHERE b.id = @bookingId;
      `);
    const booking = currentResult.recordset[0];
    if (!booking) throw new Error('BOOKING_NOT_FOUND');
    const extensionCount = Number(booking.hold_extension_count || 0);
    if (booking.hold_expired) throw new Error('BOOKING_HOLD_EXPIRED');
    const { newHoldUntil, arrival: validatedArrival } = validateHoldExtension({
      status: booking.status,
      holdUntil: booking.hold_until,
      extensionCount,
      expectedArrivalAt: arrival,
    });
    const holdUntilWallClock = formatHotelWallTimeForSql(newHoldUntil);
    const arrivalWallClock = formatHotelWallTimeForSql(validatedArrival);

    const updated = await transaction.request()
      .input('bookingId', sql.BigInt, Number(bookingId))
      .input('holdUntil', sql.VarChar(30), holdUntilWallClock)
      .input('expectedArrivalAt', sql.VarChar(30), arrivalWallClock)
      .input('reason', sql.NVarChar(500), normalizedReason)
      .input('performedByUserId', sql.BigInt, performedByUserId || null)
      .input('maxHoldExtensions', sql.Int, MAX_HOLD_EXTENSIONS)
      .query(`
        DECLARE @updated TABLE (id BIGINT, old_hold_until DATETIME2);
        UPDATE dbo.bookings
        SET hold_until = CONVERT(datetime2, @holdUntil, 126),
            expected_arrival_at = CONVERT(datetime2, @expectedArrivalAt, 126), hold_extended = 1
        OUTPUT INSERTED.id, DELETED.hold_until INTO @updated(id, old_hold_until)
        WHERE id = @bookingId AND status = 'CONFIRMED'
          AND (SELECT COUNT(*) FROM dbo.booking_hold_events count_events
               WHERE count_events.booking_id = @bookingId AND count_events.event_type = 'EXTENDED') < @maxHoldExtensions;

        INSERT INTO dbo.booking_hold_events
          (booking_id, event_type, old_hold_until, new_hold_until, expected_arrival_at, reason, performed_by_user_id, performed_by_staff_id)
        SELECT u.id, 'EXTENDED', u.old_hold_until, b.hold_until, b.expected_arrival_at, @reason, @performedByUserId, staff.id
        FROM @updated u
        JOIN dbo.bookings b ON b.id = u.id
        OUTER APPLY (SELECT TOP 1 s.id FROM dbo.staff s WHERE s.user_id = @performedByUserId ORDER BY s.id) staff;

        SELECT b.id,
          CONVERT(varchar(33), b.hold_until, 126) + '+07:00' AS hold_until,
          CONVERT(varchar(33), b.expected_arrival_at, 126) + '+07:00' AS expected_arrival_at,
          b.hold_extended
        FROM @updated u JOIN dbo.bookings b ON b.id = u.id;
      `);
    const result = updated.recordset[0];
    if (!result) throw new Error('BOOKING_HOLD_EXTENSION_LIMIT_REACHED');
    await transaction.commit();
    return {
      booking_id: Number(result.id),
      hold_until: result.hold_until,
      expected_arrival_at: result.expected_arrival_at,
      hold_extended: Boolean(result.hold_extended),
      hold_extension_count: extensionCount + 1,
    };
  } catch (error) {
    try { await transaction.rollback(); } catch (rollbackError) { console.error('Booking hold extension rollback error:', rollbackError); }
    throw error;
  }
}

async function cancelBooking({ bookingId, customerId = null, cancelledBy = null, cancellationNote = null }) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  const ownerFilter = customerId == null ? '' : 'AND customer_id = @customerId';
  const reasonCode = customerId == null ? 'RECEPTIONIST_CANCELLED' : 'CUSTOMER_CANCELLED';
  try {
    const request = transaction.request()
      .input('bookingId', sql.BigInt, Number(bookingId))
      .input('reasonCode', sql.NVarChar(50), reasonCode)
      .input('cancellationNote', sql.NVarChar(500), cancellationNote)
      .input('cancelledBy', sql.BigInt, cancelledBy == null ? null : Number(cancelledBy));
    if (customerId != null) request.input('customerId', sql.BigInt, Number(customerId));
    const result = await request.query(`
      UPDATE bookings
      SET status = 'CANCELLED', cancellation_reason = @reasonCode,
          cancellation_reason_code = @reasonCode, cancellation_reason_note = @cancellationNote,
          cancelled_at = SYSUTCDATETIME(), cancelled_by = @cancelledBy
      WHERE id = @bookingId ${ownerFilter} AND status = 'CONFIRMED'
        AND (
          @reasonCode = N'RECEPTIONIST_CANCELLED'
          OR check_in_date > CONVERT(date, DATEADD(hour, 7, SYSUTCDATETIME()))
        )
        AND NOT EXISTS (
          SELECT 1 FROM dbo.booking_rooms br
          JOIN dbo.rooms r ON r.id = br.room_id
          WHERE br.booking_id = @bookingId AND r.status = 'OCCUPIED'
        );
      SELECT @@ROWCOUNT AS updated_count;
    `);
    if (!result.recordset[0]?.updated_count) throw new Error('Booking not found or cannot be cancelled.');
    await transaction.commit();
    return { booking_id: bookingId, status: 'CANCELLED', cancellation_reason_code: reasonCode };
  } catch (error) {
    try { await transaction.rollback(); } catch (rollbackError) { console.error('Booking cancellation rollback error:', rollbackError); }
    throw error;
  }
}

async function getAssignableRooms(bookingId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('bookingId', sql.BigInt, bookingId)
    .query(`
      SELECT b.id AS booking_id, b.status AS booking_status, b.check_in_date, b.check_out_date,
        br.id AS booking_room_id, br.room_type_id, br.room_id AS assigned_room_id,
        rt.name AS room_type_name
      FROM bookings b
      JOIN booking_rooms br ON br.booking_id = b.id
      JOIN room_types rt ON rt.id = br.room_type_id
      WHERE b.id = @bookingId;
    `);
  const booking = result.recordset[0];
  if (!booking) throw new Error('Booking not found.');
  if (booking.booking_status !== 'CONFIRMED') throw new Error('Booking is not waiting for room assignment.');
  const roomSlots = await Promise.all(result.recordset.map(async (slot) => {
    const roomsResult = await pool.request()
      .input('bookingId', sql.BigInt, bookingId)
      .input('roomTypeId', sql.Int, slot.room_type_id)
      .input('checkIn', sql.Date, booking.check_in_date)
      .input('checkOut', sql.Date, booking.check_out_date)
      .query(`
        SELECT r.id, r.room_number, r.floor, r.status, rt.name AS room_type_name
        FROM rooms r JOIN room_types rt ON rt.id = r.room_type_id
        WHERE r.room_type_id = @roomTypeId
          AND r.status NOT IN ('MAINTENANCE', 'CLEANING')
          AND NOT EXISTS (
            SELECT 1 FROM booking_rooms br
            JOIN bookings b ON b.id = br.booking_id
            WHERE br.room_id = r.id AND br.booking_id <> @bookingId
              AND ${activeReservationPredicate('b')}
              AND b.check_in_date < @checkOut AND b.check_out_date > @checkIn
          )
        ORDER BY CASE WHEN r.status = 'AVAILABLE' THEN 0 ELSE 1 END, r.room_number;
      `);
    return { booking_room_id: slot.booking_room_id, room_type_id: slot.room_type_id, room_type_name: slot.room_type_name, assigned_room_id: slot.assigned_room_id, rooms: roomsResult.recordset };
  }));
  return { booking_id: bookingId, room_slots: roomSlots };
}

async function assignRoomToBooking({ bookingId, roomAssignments }) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const bookingResult = await transaction.request()
      .input('bookingId', sql.BigInt, bookingId)
      .query(`
        SELECT b.id, b.status, b.check_in_date, b.check_out_date, br.id AS booking_room_id, br.room_type_id
        FROM bookings b WITH (UPDLOCK, HOLDLOCK)
        JOIN booking_rooms br WITH (UPDLOCK, HOLDLOCK) ON br.booking_id = b.id
        WHERE b.id = @bookingId;
      `);
    const booking = bookingResult.recordset[0];
    if (!booking) throw new Error('Booking not found.');
    if (booking.status !== 'CONFIRMED') throw new Error('Booking is not waiting for room assignment.');
    if (!Array.isArray(roomAssignments) || roomAssignments.length !== bookingResult.recordset.length) throw new Error('Every booking room must be assigned.');
    if (new Set(roomAssignments.map((item) => Number(item.booking_room_id))).size !== roomAssignments.length || new Set(roomAssignments.map((item) => Number(item.room_id))).size !== roomAssignments.length) throw new Error('Duplicate room assignment.');
    const slotsById = new Map(bookingResult.recordset.map((slot) => [Number(slot.booking_room_id), slot]));
    for (const assignment of roomAssignments) {
      const slot = slotsById.get(Number(assignment.booking_room_id));
      if (!slot) throw new Error('Invalid booking room.');
      const roomResult = await transaction.request()
        .input('roomId', sql.Int, Number(assignment.room_id))
        .input('roomTypeId', sql.Int, slot.room_type_id)
        .input('bookingId', sql.BigInt, bookingId)
        .input('checkIn', sql.Date, booking.check_in_date)
        .input('checkOut', sql.Date, booking.check_out_date)
        .query(`
          SELECT r.id FROM rooms r WITH (UPDLOCK, HOLDLOCK)
          WHERE r.id = @roomId AND r.room_type_id = @roomTypeId
            AND r.status NOT IN ('MAINTENANCE', 'CLEANING')
            AND NOT EXISTS (
              SELECT 1 FROM booking_rooms br
              JOIN bookings b ON b.id = br.booking_id
              WHERE br.room_id = r.id AND br.booking_id <> @bookingId
                AND ${activeReservationPredicate('b')}
                AND b.check_in_date < @checkOut AND b.check_out_date > @checkIn
            );
        `);
      if (!roomResult.recordset.length) throw new Error('Selected room is unavailable.');
      await transaction.request()
        .input('bookingRoomId', sql.BigInt, Number(assignment.booking_room_id))
        .input('bookingId', sql.BigInt, bookingId)
        .input('roomId', sql.Int, Number(assignment.room_id))
        .query('UPDATE booking_rooms SET room_id = @roomId WHERE id = @bookingRoomId AND booking_id = @bookingId;');
    }
    await transaction.commit();
    return { booking_id: bookingId, assignments: roomAssignments };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function checkOutBooking(bookingId, actorUserId = null) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const bookingResult = await transaction.request()
      .input('bookingId', sql.BigInt, bookingId)
      .query(`
        SELECT b.id, b.status, br.room_id
        FROM bookings b WITH (UPDLOCK, HOLDLOCK)
        JOIN booking_rooms br ON br.booking_id = b.id
        WHERE b.id = @bookingId;
      `);
    const booking = bookingResult.recordset[0];
    if (!booking) throw new Error('Booking not found.');
    if (booking.status !== 'CHECKED_IN') throw new Error('Booking is not checked in.');

    const staffResult = await transaction.request()
      .input('userId', sql.BigInt, Number(actorUserId))
      .query('SELECT TOP (1) id FROM dbo.staff WITH (UPDLOCK, HOLDLOCK) WHERE user_id = @userId;');
    const checkOutStaffId = staffResult.recordset[0]?.id;
    if (!checkOutStaffId) throw new Error('Staff profile was not found for check-out user.');

    await transaction.request()
      .input('bookingId', sql.BigInt, bookingId)
      .input('roomId', sql.Int, booking.room_id)
      .input('checkOutStaffId', sql.BigInt, checkOutStaffId)
      .query(`
        UPDATE bookings SET status = 'CHECKED_OUT' WHERE id = @bookingId;
        UPDATE booking_rooms SET checked_out_by_staff_id = @checkOutStaffId, actual_check_out = SYSUTCDATETIME() WHERE booking_id = @bookingId;
        UPDATE rooms SET status = 'CLEANING' WHERE id = @roomId AND status = 'OCCUPIED';
      `);
    await transaction.commit();
    return { booking_id: bookingId, status: 'CHECKED_OUT', room_status: 'CLEANING' };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function reportRoomMaintenance({ roomId, reportedBy, description }) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const roomResult = await transaction.request()
      .input('roomId', sql.Int, Number(roomId))
      .query(`SELECT id, status FROM dbo.rooms WITH (UPDLOCK, HOLDLOCK) WHERE id = @roomId;`);
    const room = roomResult.recordset[0];
    if (!room) throw new Error('Room not found.');
    if (room.status !== 'CLEANING') throw new Error('Room is not waiting for cleaning completion.');

    const existingResult = await transaction.request()
      .input('roomId', sql.Int, Number(roomId))
      .query(`
        SELECT TOP (1) id
        FROM dbo.room_problem_reports WITH (UPDLOCK, HOLDLOCK)
        WHERE room_id = @roomId AND status = 'OPEN'
        ORDER BY reported_at DESC;
      `);
    let reportId = existingResult.recordset[0]?.id;
    if (!reportId) {
      const reportResult = await transaction.request()
        .input('roomId', sql.Int, Number(roomId))
        .input('reportedBy', sql.BigInt, Number(reportedBy))
        .input('title', sql.NVarChar(200), 'Phòng cần bảo trì')
        .input('description', sql.NVarChar(sql.MAX), String(description || 'Nhân viên buồng phòng báo cần kiểm tra/bảo trì trước khi đưa phòng vào sử dụng.').trim())
        .query(`
          INSERT INTO dbo.room_problem_reports (room_id, reported_by, title, description, status, reported_at)
          OUTPUT INSERTED.id
          VALUES (@roomId, @reportedBy, @title, @description, 'OPEN', SYSUTCDATETIME());
        `);
      reportId = reportResult.recordset[0].id;
    }
    await transaction.commit();
    return { report_id: Number(reportId), room_id: Number(roomId), room_status: 'CLEANING' };
  } catch (error) {
    try { await transaction.rollback(); } catch (rollbackError) { console.error('Maintenance report rollback error:', rollbackError); }
    throw error;
  }
}

async function getOpenRoomMaintenanceReports() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT report.id, report.room_id, room.room_number, room.floor,
      report.title, report.description, report.status, report.reported_at,
      reporter.full_name AS reported_by_name
    FROM dbo.room_problem_reports report
    JOIN dbo.rooms room ON room.id = report.room_id
    JOIN dbo.users reporter ON reporter.id = report.reported_by
    WHERE report.status = 'OPEN'
    ORDER BY report.reported_at DESC;
  `);
  return result.recordset;
}

async function resolveRoomMaintenanceReport(reportId) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const reportResult = await transaction.request()
      .input('reportId', sql.BigInt, Number(reportId))
      .query(`
        SELECT TOP (1) id, room_id
        FROM dbo.room_problem_reports WITH (UPDLOCK, HOLDLOCK)
        WHERE id = @reportId AND status = 'OPEN';
      `);
    const report = reportResult.recordset[0];
    if (!report) throw new Error('Maintenance report not found or already resolved.');

    await transaction.request()
      .input('reportId', sql.BigInt, Number(reportId))
      .query(`
        UPDATE dbo.room_problem_reports
        SET status = 'RESOLVED', resolved_at = SYSUTCDATETIME()
        WHERE id = @reportId AND status = 'OPEN';
      `);
    await transaction.request()
      .input('roomId', sql.Int, Number(report.room_id))
      .query(`
        UPDATE dbo.rooms
        SET status = 'AVAILABLE'
        WHERE id = @roomId AND status = 'MAINTENANCE'
          AND NOT EXISTS (
            SELECT 1 FROM dbo.room_problem_reports
            WHERE room_id = @roomId AND status = 'OPEN'
          );
      `);
    await transaction.commit();
    return { report_id: Number(reportId), room_id: Number(report.room_id), status: 'RESOLVED' };
  } catch (error) {
    try { await transaction.rollback(); } catch (rollbackError) { console.error('Resolve maintenance report rollback error:', rollbackError); }
    throw error;
  }
}

async function getRoomStatuses() {
  const pool = await getPool();
  // Đồng bộ các phòng bị lệch trạng thái nhưng vẫn có booking đang CHECKED_IN.
  await pool.request().query(`
    UPDATE rooms
    SET status = 'OCCUPIED'
    WHERE EXISTS (
      SELECT 1 FROM booking_rooms br
      JOIN bookings b ON b.id = br.booking_id
      WHERE br.room_id = rooms.id AND b.status = 'CHECKED_IN'
    ) AND status <> 'OCCUPIED';
  `);
  const result = await pool.request().query(`
    SELECT r.id, r.room_number, r.floor,
      CASE WHEN EXISTS (
        SELECT 1 FROM booking_rooms active_br
        JOIN bookings active_b ON active_b.id = active_br.booking_id
        WHERE active_br.room_id = r.id AND active_b.status = 'CHECKED_IN'
      ) THEN 'OCCUPIED' ELSE r.status END AS status,
      CASE WHEN EXISTS (
        SELECT 1 FROM dbo.room_problem_reports maintenance_report
        WHERE maintenance_report.room_id = r.id AND maintenance_report.status = 'OPEN'
      ) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS has_open_maintenance_report,
      r.room_type_id, rt.name AS room_type_name
    FROM rooms r JOIN room_types rt ON rt.id = r.room_type_id
    ORDER BY r.floor, r.room_number;
  `);
  return result.recordset;
}

module.exports = {
  createWalkInBooking,
  createCustomerBooking,
  expirePendingBookings,
  expireStaleBookings,
  checkInBooking,
  getRecentBookings,
  getBookingDetails,
  getStayExtensionBilling,
  updateBooking,
  extendCheckedInBooking,
  cancelBooking,
  getActiveBookings,
  getInHouseBookings,
  checkOutBooking,
  reportRoomMaintenance,
  getOpenRoomMaintenanceReports,
  resolveRoomMaintenanceReport,
  getRoomStatuses,
  getAssignableRooms,
  assignRoomToBooking,
  extendBookingHold,
};
