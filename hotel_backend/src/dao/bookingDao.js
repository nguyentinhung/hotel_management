const { sql, getPool } = require('../config/db');

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

/**
 * Tính số đêm giữa 2 ngày
 */
function calculateNights(checkInDate, checkOutDate) {
  const start = new Date(checkInDate);
  const end = new Date(checkOutDate);
  const diff = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

/**
 * Tạo mã booking duy nhất (độ dài tối đa 20 ký tự theo schema database)
 * Ví dụ: BK98234123
 */
function generateBookingCode() {
  const timestamp = Date.now().toString().slice(-6);
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  return `BK${timestamp}${randomSuffix}`;
}

function activeReservationPredicate(alias) {
  return `(${alias}.status = 'CHECKED_IN' OR (${alias}.status = 'CONFIRMED' AND (
    COALESCE(${alias}.deposit_amount, 0) >= CEILING(COALESCE((SELECT SUM(dbr.price_per_night) FROM dbo.booking_rooms dbr WHERE dbr.booking_id = ${alias}.id), 0) * DATEDIFF(day, ${alias}.check_in_date, ${alias}.check_out_date) * 0.30)
  )))`;
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
    depositAmount = 0,
    serviceSelections = [],
    specialRequest = '',
    checkInNow = false,
  } = data;

  const pool = await getPool();

  // Kiểm tra từng loại phòng được chọn và chọn phòng vật lý cho từng dòng.
  const nights = calculateNights(checkInDate, checkOutDate);
  const selectedRooms = [];
  const selectedPhysicalRoomIds = new Set();
  let totalPerNight = 0;
  let totalCapacityAdults = 0;
  let totalCapacityChildren = 0;
  for (const selection of roomSelections) {
    const roomTypeResult = await pool.request()
      .input('roomTypeId', sql.Int, Number(selection.roomTypeId))
      .query('SELECT TOP 1 id, name, base_price, max_adults, max_children FROM room_types WHERE id = @roomTypeId;');
    if (!roomTypeResult.recordset.length) throw new Error('Loại phòng không tồn tại trong hệ thống.');
    const roomType = roomTypeResult.recordset[0];
    let selectedRoom = null;
    const roomQuery = pool.request()
      .input('roomTypeId', sql.Int, roomType.id)
      .input('checkIn', sql.Date, checkInDate)
      .input('checkOut', sql.Date, checkOutDate);
    let roomFilter = 'r.room_type_id = @roomTypeId';
    if (selection.roomId) {
      roomQuery.input('roomId', sql.Int, Number(selection.roomId));
      roomFilter += ' AND r.id = @roomId';
    }
    const roomCheck = await roomQuery.query(`
      SELECT TOP 100 r.id, r.room_number, r.status
      FROM rooms r
      WHERE ${roomFilter}
        AND r.status NOT IN ('MAINTENANCE', 'CLEANING')
        AND NOT EXISTS (
          SELECT 1 FROM booking_rooms br JOIN bookings b ON b.id = br.booking_id
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
    const serviceResult = await pool.request()
      .input('serviceId', sql.Int, serviceId)
      .query('SELECT TOP 1 id, price FROM services WHERE id = @serviceId AND is_active = 1 AND is_deleted = 0;');
    if (!serviceResult.recordset.length) throw new Error('Selected service was not found.');
    validServices.push({ serviceId, quantity, price: Number(serviceResult.recordset[0].price ?? 0) });
  }
  const serviceTotal = validServices.reduce((sum, service) => sum + service.price * service.quantity, 0) * selectedRooms.length;
  const totalAmount = totalPerNight * nights + serviceTotal;
  const requiredDepositAmount = Math.ceil(totalPerNight * nights * 0.3);
  if (checkInNow && finalDeposit < requiredDepositAmount) {
    throw new Error(`A deposit of at least ${requiredDepositAmount} is required before check-in.`);
  }

  // 3. Tìm hoặc tạo khách hàng (customer) trong bảng users
  // Vì bảng bookings có FK customer_id NOT NULL -> bắt buộc cần user id
  const emailToUse = guestEmail && guestEmail.trim()
    ? guestEmail.trim().toLowerCase()
    : `walkin_${guestPhone.replace(/\D/g, '')}@hotellumiere.vn`;

  let customerId = null;

  const userQuery = await pool.request()
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
    const createUserResult = await pool.request()
      .input('role_id', sql.TinyInt, 1) // CUSTOMER
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
  // Nếu lễ tân chọn "Nhận phòng ngay" -> CHECKED_IN, ngược lại CONFIRMED
  const bookingCode = generateBookingCode();
  const initialStatus = checkInNow ? 'CHECKED_IN' : 'CONFIRMED';
  const finalDeposit = Number(depositAmount ?? 0);
  if (checkInNow && selectedRooms.some(({ room }) => !room)) throw new Error('Cannot check in before every room is assigned and ready.');

  // 5. Thêm bản ghi vào bảng bookings
  const insertBookingResult = await pool.request()
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
    .input('deposit_amount', sql.Decimal(12, 2), finalDeposit)
    .input('special_request', sql.NVarChar(500), specialRequest ? specialRequest.trim() : null)
    .query(`
      INSERT INTO bookings (
        booking_code, customer_id, guest_full_name, guest_phone, guest_email,
        check_in_date, check_out_date, adults, children, status,
        total_amount, deposit_amount, created_at, special_request
      )
      OUTPUT INSERTED.id, INSERTED.booking_code, INSERTED.created_at
      VALUES (
        @booking_code, @customer_id, @guest_full_name, @guest_phone, @guest_email,
        @check_in_date, @check_out_date, @adults, @children, @status,
        @total_amount, @deposit_amount, SYSUTCDATETIME(), @special_request
      );
    `);

  const createdBooking = insertBookingResult.recordset[0];
  const newBookingId = createdBooking.id;

  // Thêm một dòng booking_rooms cho mỗi phòng đã chọn.
  for (const selected of selectedRooms) {
    const roomInsert = await pool.request()
      .input('booking_id', sql.BigInt, newBookingId)
      .input('room_type_id', sql.Int, selected.roomType.id)
      .input('room_id', sql.Int, selected.room?.id ?? null)
      .input('price_per_night', sql.Decimal(12, 2), Number(selected.roomType.base_price))
      .input('actual_check_in', sql.DateTime2, checkInNow ? new Date() : null)
      .query(`
        INSERT INTO booking_rooms (booking_id, room_type_id, room_id, price_per_night, actual_check_in)
        OUTPUT INSERTED.id
        VALUES (@booking_id, @room_type_id, @room_id, @price_per_night, @actual_check_in);
      `);
    for (const service of validServices) {
      await pool.request()
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
  await pool.request()
    .input('booking_id', sql.BigInt, newBookingId)
    .input('full_name', sql.NVarChar(150), guestFullName.trim())
    .input('phone', sql.VarChar(20), guestPhone.trim())
    .input('id_card_number', sql.VarChar(50), guestIdCard ? guestIdCard.trim() : null)
    .input('id_card_verified', sql.Bit, checkInNow && guestIdCard && guestIdCard.trim() ? 1 : 0)
    .query(`
      INSERT INTO booking_guests (booking_id, full_name, phone, id_card_number, id_card_verified)
      VALUES (@booking_id, @full_name, @phone, @id_card_number, @id_card_verified);
    `);

  // 8. Nếu nhận phòng ngay (checkInNow) và đã chọn số phòng, cập nhật trạng thái phòng vật lý
  if (checkInNow) {
    for (const selected of selectedRooms) {
    await pool.request()
      .input('roomId', sql.Int, selected.room?.id)
      .query(`
        UPDATE rooms
        SET status = 'OCCUPIED'
        WHERE id = @roomId;
      `);
    }
  }

  // 9. Trả về kết quả hoàn chỉnh
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
    total_amount: totalAmount,
    deposit_amount: finalDeposit,
    remaining_balance: totalAmount - finalDeposit,
    status: initialStatus,
    created_at: createdBooking.created_at,
  };
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
        WHERE id = @customerId AND role_id = 1 AND status = 'ACTIVE';
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
             WHERE br.room_type_id = @roomTypeId AND (
               b.status = 'CHECKED_IN' OR (b.status = 'CONFIRMED' AND (
                 COALESCE(b.deposit_amount, 0) >= CEILING(COALESCE((SELECT SUM(dbr.price_per_night) FROM dbo.booking_rooms dbr WHERE dbr.booking_id = b.id), 0) * DATEDIFF(day, b.check_in_date, b.check_out_date) * 0.30)
               ))
             )
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
          SELECT TOP 1 id, name, price
          FROM services
          WHERE id = @serviceId AND is_active = 1 AND is_deleted = 0;
        `);
      if (!serviceResult.recordset.length) throw new Error('Selected service was not found.');
      const service = serviceResult.recordset[0];
      validServices.push({ serviceId: Number(service.id), quantity, price: Number(service.price ?? 0), name: service.name });
    }

    const selectedRoomCount = selectedTypes.reduce((count, roomType) => count + roomType.quantity, 0);
    const serviceTotal = validServices.reduce((sum, service) => sum + service.price * service.quantity, 0) * selectedRoomCount;
    const totalAmount = totalPerNight * nights + serviceTotal;
    const requiredDepositAmount = Math.ceil(totalPerNight * nights * 0.3);
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
      .input('special_request', sql.NVarChar(500), specialRequest ? String(specialRequest).trim() : null)
      .query(`
        INSERT INTO bookings (
          booking_code, customer_id, guest_full_name, guest_phone, guest_email,
          check_in_date, check_out_date, adults, children, status,
          total_amount, deposit_amount, created_at, special_request
        )
        OUTPUT INSERTED.id, INSERTED.booking_code, INSERTED.created_at
        VALUES (
          @booking_code, @customer_id, @guest_full_name, @guest_phone, @guest_email,
          @check_in_date, @check_out_date, @adults, @children, 'PENDING_PAYMENT',
          @total_amount, 0, SYSUTCDATETIME(), @special_request
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

async function checkInBooking({ bookingId, idCardNumber = '' }) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    const bookingResult = await transaction.request()
      .input('bookingId', sql.BigInt, Number(bookingId))
      .query(`
        SELECT TOP 1
          b.id, b.booking_code, b.status, b.check_in_date, b.check_out_date, b.deposit_amount,
          deposit_summary.required_deposit_amount, deposit_summary.requires_deposit_payment,
          b.guest_full_name, b.guest_phone, br.room_id,
          guest_identity.id_card_number
        FROM bookings b WITH (UPDLOCK, HOLDLOCK)
        LEFT JOIN booking_rooms br ON br.booking_id = b.id
        OUTER APPLY (
          SELECT
            CEILING(COALESCE(SUM(br_deposit.price_per_night), 0)
              * DATEDIFF(day, b.check_in_date, b.check_out_date) * 0.30) AS required_deposit_amount,
            CASE WHEN EXISTS (
              SELECT 1 FROM dbo.payments p
              WHERE p.booking_id = b.id AND p.payment_type = 'DEPOSIT'
            ) THEN 1 ELSE 0 END AS requires_deposit_payment
          FROM dbo.booking_rooms br_deposit
          WHERE br_deposit.booking_id = b.id
        ) deposit_summary
        OUTER APPLY (
          SELECT TOP 1 bg.id_card_number
          FROM dbo.booking_guests bg
          WHERE bg.booking_id = b.id
          ORDER BY bg.id
        ) guest_identity
        WHERE b.id = @bookingId;
      `);
    if (!bookingResult.recordset.length) throw new Error('Booking was not found.');
    const booking = bookingResult.recordset[0];
    if (booking.status !== 'CONFIRMED') throw new Error('Booking is not waiting for check-in.');
    if (Number(booking.deposit_amount || 0) < Number(booking.required_deposit_amount || 0)) {
      throw new Error('Deposit payment is required before check-in.');
    }

    const today = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const checkInDate = new Date(booking.check_in_date).toISOString().slice(0, 10);
    const checkOutDate = new Date(booking.check_out_date).toISOString().slice(0, 10);
    if (today < checkInDate || today >= checkOutDate) {
      throw new Error('Booking is outside its check-in dates.');
    }
    const normalizedIdCard = String(idCardNumber || '').trim();
    if (!booking.id_card_number && !/^\d{12}$/.test(normalizedIdCard)) {
      throw new Error('A valid 12-digit CCCD is required to check in this booking.');
    }
    const idCardToSave = normalizedIdCard || booking.id_card_number;
    if (!booking.room_id) throw new Error('Assign a room before checking in this booking.');

    const assignedRoom = await transaction.request()
      .input('roomId', sql.Int, booking.room_id)
      .query('SELECT status FROM rooms WITH (UPDLOCK, HOLDLOCK) WHERE id = @roomId;');
    if (assignedRoom.recordset[0]?.status !== 'AVAILABLE') throw new Error('Assigned room is not ready for check-in.');

    await transaction.request()
      .input('bookingId', sql.BigInt, booking.id)
      .input('idCardNumber', sql.VarChar(50), idCardToSave)
      .query(`
        UPDATE booking_guests
        SET id_card_number = COALESCE(id_card_number, @idCardNumber),
            id_card_verified = 1
        WHERE booking_id = @bookingId;
      `);

    await transaction.request()
      .input('bookingId', sql.BigInt, booking.id)
      .input('roomId', sql.Int, booking.room_id)
      .query(`
        UPDATE booking_rooms
        SET actual_check_in = SYSUTCDATETIME()
        WHERE booking_id = @bookingId;

        UPDATE bookings
        SET status = 'CHECKED_IN'
        WHERE id = @bookingId AND status = 'CONFIRMED';

        UPDATE rooms
        SET status = 'OCCUPIED'
        WHERE id = @roomId;
      `);

    await transaction.commit();
    return { booking_id: booking.id, booking_code: booking.booking_code, status: 'CHECKED_IN' };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function getRecentBookings(limit = 10, activeOnly = false, customerId = null) {
  const pool = await getPool();

  await pool.request().query(`
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
  if (activeOnly) filters.push(`(
    b.status = 'CHECKED_IN'
    OR (b.status = 'CONFIRMED' AND COALESCE(b.deposit_amount, 0) >= deposit_summary.required_deposit_amount)
    OR (b.status = 'CHECKED_OUT' AND b.total_amount > b.deposit_amount + COALESCE(payment_summary.final_paid_amount, 0))
  )`);
  if (customerId !== null) {
    request.input('customerId', sql.BigInt, Number(customerId));
    filters.push('b.customer_id = @customerId');
  }
  const activeFilter = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const result = await request.query(`
      SELECT ${limitClause}
        b.id,
        b.booking_code,
        b.guest_full_name,
        b.guest_phone,
        b.guest_email,
        b.check_in_date,
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
        b.created_at,
        b.special_request,
        type_summary.room_type_name,
        type_summary.room_type_id,
        room_summary.room_number,
        room_summary.assigned_room_id,
        room_summary.room_status,
        CASE WHEN guest_identity.id_card_number IS NULL THEN CAST(0 AS bit) ELSE CAST(1 AS bit) END AS has_guest_id_card
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
          CEILING(COALESCE(SUM(br_deposit.price_per_night), 0)
            * DATEDIFF(day, b.check_in_date, b.check_out_date) * 0.30) AS required_deposit_amount,
          CASE WHEN EXISTS (
            SELECT 1 FROM dbo.payments p
            WHERE p.booking_id = b.id AND p.payment_type = 'DEPOSIT'
          ) THEN 1 ELSE 0 END AS requires_deposit_payment
        FROM dbo.booking_rooms br_deposit
        WHERE br_deposit.booking_id = b.id
      ) deposit_summary
      OUTER APPLY (
        SELECT MIN(r.id) AS assigned_room_id,
          STRING_AGG(CAST(r.room_number AS nvarchar(max)), ', ') AS room_number,
          MIN(r.status) AS room_status
        FROM booking_rooms br3
        LEFT JOIN rooms r ON r.id = br3.room_id
        WHERE br3.booking_id = b.id
      ) room_summary
      OUTER APPLY (
        SELECT TOP 1 bg.id_card_number
        FROM dbo.booking_guests bg
        WHERE bg.booking_id = b.id
        ORDER BY bg.id
      ) guest_identity
      ${activeFilter}
      ORDER BY b.id DESC;
    `);

  return result.recordset.map((item) => ({
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
    created_at: item.created_at,
    special_request: item.special_request,
    room_type_name: item.room_type_name,
    room_type_id: item.room_type_id,
    room_number: item.room_number,
    assigned_room_id: item.assigned_room_id,
    room_status: item.room_status,
    has_guest_id_card: Boolean(item.has_guest_id_card),
  }));
}

async function getActiveBookings() {
  return getRecentBookings(null, true);
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
      SELECT b.id, b.customer_id, b.status, b.check_in_date, b.check_out_date,
        b.guest_full_name, b.guest_phone, b.guest_email,
        booking_rooms.max_adults, booking_rooms.max_children, booking_rooms.price_per_night
      FROM bookings b WITH (UPDLOCK, HOLDLOCK)
      OUTER APPLY (
        SELECT SUM(rt.max_adults) AS max_adults, SUM(rt.max_children) AS max_children,
          SUM(COALESCE(br.price_per_night, rt.base_price)) AS price_per_night
        FROM booking_rooms br JOIN room_types rt ON rt.id = br.room_type_id
        WHERE br.booking_id = b.id
      ) booking_rooms
      WHERE b.id = @bookingId ${ownerFilter};
    `);
    const current = currentResult.recordset[0];
    if (!current) throw new Error('Booking not found.');
    if (current.status !== 'CONFIRMED') throw new Error('Only confirmed bookings can be updated.');
    const vietnamToday = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (new Date(current.check_in_date).toISOString().slice(0, 10) <= vietnamToday) {
      throw new Error('Booking can only be changed before its check-in date.');
    }
    if (changes.checkInDate <= vietnamToday) {
      throw new Error('New check-in date must be after today.');
    }
    if (changes.checkOutDate <= changes.checkInDate) throw new Error('Check-out must be after check-in.');
    if (Number(changes.adults) < 1 || Number(changes.adults) > current.max_adults || Number(changes.children) < 0 || Number(changes.children) > current.max_children) {
      throw new Error('Guest count exceeds room capacity.');
    }
    const roomSelectionResult = await transaction.request()
      .input('bookingId', sql.BigInt, Number(bookingId))
      .query('SELECT room_type_id, COUNT(*) AS quantity FROM booking_rooms WHERE booking_id = @bookingId GROUP BY room_type_id;');
    for (const selection of roomSelectionResult.recordset) {
      const inventoryResult = await transaction.request()
        .input('roomTypeId', sql.Int, selection.room_type_id)
        .input('quantity', sql.Int, selection.quantity)
        .input('bookingId', sql.BigInt, Number(bookingId))
        .input('checkIn', sql.Date, changes.checkInDate)
        .input('checkOut', sql.Date, changes.checkOutDate)
        .query(`
          SELECT
            (SELECT COUNT(*) FROM rooms WHERE room_type_id = @roomTypeId AND status <> 'MAINTENANCE') AS inventory_count,
            (SELECT COUNT(*) FROM booking_rooms br JOIN bookings b ON b.id = br.booking_id
             WHERE br.room_type_id = @roomTypeId AND b.id <> @bookingId AND ${activeReservationPredicate('b')}
               AND b.check_in_date < @checkOut AND b.check_out_date > @checkIn) AS reserved_count,
            (SELECT COUNT(*) FROM booking_rooms own_br JOIN rooms own_room ON own_room.id = own_br.room_id
             WHERE own_br.booking_id = @bookingId AND own_br.room_type_id = @roomTypeId) AS assigned_count;
        `);
      const inventory = inventoryResult.recordset[0];
      if (!inventory || Number(inventory.inventory_count) - Number(inventory.reserved_count) < Number(selection.quantity)) throw new Error('No rooms are available for those dates.');
      if (Number(inventory.assigned_count) > 0) {
        const assignedRoomConflict = await transaction.request()
          .input('roomTypeId', sql.Int, selection.room_type_id)
          .input('bookingId', sql.BigInt, Number(bookingId))
          .input('checkIn', sql.Date, changes.checkInDate)
          .input('checkOut', sql.Date, changes.checkOutDate)
          .query(`
            SELECT TOP 1 other_b.id FROM booking_rooms own_br
            JOIN booking_rooms other_br ON other_br.room_id = own_br.room_id AND other_br.booking_id <> own_br.booking_id
            JOIN bookings other_b ON other_b.id = other_br.booking_id
            WHERE own_br.booking_id = @bookingId AND own_br.room_type_id = @roomTypeId
              AND ${activeReservationPredicate('other_b')}
              AND other_b.check_in_date < @checkOut AND other_b.check_out_date > @checkIn;
          `);
        if (assignedRoomConflict.recordset.length) throw new Error('The assigned room is unavailable for those dates.');
      }
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
    const totalAmount = Number(current.price_per_night) * nights + Number(chargesResult.recordset[0].service_total ?? 0);
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
          total_amount = @totalAmount
        WHERE id = @bookingId;
        UPDATE booking_guests SET full_name = @guestName, phone = @guestPhone WHERE booking_id = @bookingId;
      `);
    await transaction.commit();
    return { booking_id: bookingId, check_in_date: changes.checkInDate, check_out_date: changes.checkOutDate, total_amount: totalAmount };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function cancelBooking({ bookingId, customerId = null }) {
  const pool = await getPool();
  const request = pool.request().input('bookingId', sql.BigInt, Number(bookingId));
  const ownerFilter = customerId == null ? '' : 'AND customer_id = @customerId';
  if (customerId != null) request.input('customerId', sql.BigInt, Number(customerId));
  request.input('isReceptionCancellation', sql.Bit, customerId == null ? 1 : 0);
  const result = await request.query(`
    UPDATE bookings SET status = 'CANCELLED'
    WHERE id = @bookingId ${ownerFilter} AND status = 'CONFIRMED'
      AND (
        check_in_date > CONVERT(date, DATEADD(hour, 7, SYSUTCDATETIME()))
        OR (
          @isReceptionCancellation = 1
          AND check_in_date = CONVERT(date, DATEADD(hour, 7, SYSUTCDATETIME()))
          AND DATEADD(hour, 18, CONVERT(datetime2, check_in_date)) <= DATEADD(hour, 7, SYSUTCDATETIME())
          AND created_at < DATEADD(hour, 11, CONVERT(datetime2, check_in_date))
        )
      );
    SELECT @@ROWCOUNT AS updated_count;
  `);
  if (!result.recordset[0]?.updated_count) throw new Error('Booking not found or cannot be cancelled.');
  return { booking_id: bookingId, status: 'CANCELLED' };
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

async function checkOutBooking(bookingId) {
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

    await transaction.request()
      .input('bookingId', sql.BigInt, bookingId)
      .input('roomId', sql.Int, booking.room_id)
      .query(`
        UPDATE bookings SET status = 'CHECKED_OUT' WHERE id = @bookingId;
        UPDATE rooms SET status = 'CLEANING' WHERE id = @roomId AND status = 'OCCUPIED';
      `);
    await transaction.commit();
    return { booking_id: bookingId, status: 'CHECKED_OUT', room_status: 'CLEANING' };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function updateRoomStatus(roomId, status, currentStatus = 'CLEANING') {
  const pool = await getPool();
  const result = await pool.request()
    .input('roomId', sql.Int, roomId)
    .input('status', sql.VarChar(20), status)
    .input('currentStatus', sql.VarChar(20), currentStatus)
    .query(`
      UPDATE dbo.rooms
      SET status = CASE
        WHEN @currentStatus = 'CLEANING' AND @status = 'AVAILABLE' AND EXISTS (
          SELECT 1 FROM dbo.room_problem_reports report
          WHERE report.room_id = dbo.rooms.id AND report.status = 'OPEN'
        ) THEN 'MAINTENANCE'
        ELSE @status
      END
      WHERE id = @roomId AND status = @currentStatus;
      SELECT @@ROWCOUNT AS updated_count, (SELECT status FROM dbo.rooms WHERE id = @roomId) AS status;
    `);
  if (!result.recordset[0]?.updated_count) throw new Error('Room is not waiting for cleaning completion.');
  return { room_id: roomId, status: result.recordset[0].status };
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
  checkInBooking,
  getRecentBookings,
  updateBooking,
  cancelBooking,
  getActiveBookings,
  checkOutBooking,
  updateRoomStatus,
  reportRoomMaintenance,
  getOpenRoomMaintenanceReports,
  resolveRoomMaintenanceReport,
  getRoomStatuses,
  getAssignableRooms,
  assignRoomToBooking,
};
