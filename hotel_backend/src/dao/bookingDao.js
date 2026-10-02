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
          WHERE br.room_id = r.id AND b.status <> 'CANCELLED'
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
  const totalAmount = totalPerNight * nights;

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
      .input('role_id', sql.TinyInt, 1) // 1: CUSTOMER
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
    await pool.request()
      .input('booking_id', sql.BigInt, newBookingId)
      .input('room_type_id', sql.Int, selected.roomType.id)
      .input('room_id', sql.Int, selected.room?.id ?? null)
      .input('price_per_night', sql.Decimal(12, 2), Number(selected.roomType.base_price))
      .input('actual_check_in', sql.DateTime2, checkInNow ? new Date() : null)
      .query(`
        INSERT INTO booking_rooms (booking_id, room_type_id, room_id, price_per_night, actual_check_in)
        VALUES (@booking_id, @room_type_id, @room_id, @price_per_night, @actual_check_in);
      `);
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
             WHERE br.room_type_id = @roomTypeId AND b.status <> 'CANCELLED'
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
    const totalAmount = totalPerNight * nights;
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
          @check_in_date, @check_out_date, @adults, @children, 'CONFIRMED',
          @total_amount, 0, SYSUTCDATETIME(), @special_request
        );
      `);
    const booking = bookingResult.recordset[0];

    for (const roomType of selectedTypes) {
      for (let index = 0; index < roomType.quantity; index += 1) {
        await transaction.request()
          .input('booking_id', sql.BigInt, booking.id)
          .input('room_type_id', sql.Int, roomType.id)
          .input('price_per_night', sql.Decimal(12, 2), Number(roomType.base_price))
          .query(`
            INSERT INTO booking_rooms (booking_id, room_type_id, room_id, price_per_night)
            VALUES (@booking_id, @room_type_id, NULL, @price_per_night);
          `);
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
      remaining_balance: totalAmount,
      status: 'CONFIRMED',
      created_at: booking.created_at,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function checkInBooking({ bookingId, idCardNumber }) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    const bookingResult = await transaction.request()
      .input('bookingId', sql.BigInt, Number(bookingId))
      .query(`
        SELECT TOP 1
          b.id, b.booking_code, b.status, b.check_in_date, b.check_out_date,
          CASE WHEN DATEADD(hour, 7, SYSUTCDATETIME()) < DATEADD(hour, 18, CONVERT(datetime2, b.check_in_date)) THEN 1 ELSE 0 END AS before_checkin_deadline,
          b.guest_full_name, b.guest_phone, br.room_id
        FROM bookings b WITH (UPDLOCK, HOLDLOCK)
        LEFT JOIN booking_rooms br ON br.booking_id = b.id
        WHERE b.id = @bookingId;
      `);
    if (!bookingResult.recordset.length) throw new Error('Booking was not found.');
    const booking = bookingResult.recordset[0];
    if (booking.status !== 'CONFIRMED') throw new Error('Booking is not waiting for check-in.');

    const today = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const checkInDate = new Date(booking.check_in_date).toISOString().slice(0, 10);
    const checkOutDate = new Date(booking.check_out_date).toISOString().slice(0, 10);
    if (today < checkInDate || today >= checkOutDate) {
      throw new Error('Booking is outside its check-in dates.');
    }
    if (!booking.before_checkin_deadline) {
      await transaction.request()
        .input('bookingId', sql.BigInt, booking.id)
        .query("UPDATE bookings SET status = 'CANCELLED' WHERE id = @bookingId AND status = 'CONFIRMED';");
      await transaction.commit();
      return { booking_id: booking.id, booking_code: booking.booking_code, status: 'CANCELLED', auto_cancelled: true };
    }
    if (!booking.room_id) throw new Error('Assign a room before checking in this booking.');

    const assignedRoom = await transaction.request()
      .input('roomId', sql.Int, booking.room_id)
      .query('SELECT status FROM rooms WITH (UPDLOCK, HOLDLOCK) WHERE id = @roomId;');
    if (assignedRoom.recordset[0]?.status !== 'AVAILABLE') throw new Error('Assigned room is not ready for check-in.');

    const guestResult = await transaction.request()
      .input('bookingId', sql.BigInt, booking.id)
      .input('idCardNumber', sql.VarChar(50), String(idCardNumber).trim())
      .query(`
        UPDATE booking_guests
        SET id_card_number = @idCardNumber, id_card_verified = 1
        WHERE booking_id = @bookingId;
        SELECT @@ROWCOUNT AS updated_count;
      `);
    if (!guestResult.recordset[0]?.updated_count) {
      await transaction.request()
        .input('bookingId', sql.BigInt, booking.id)
        .input('fullName', sql.NVarChar(150), booking.guest_full_name)
        .input('phone', sql.VarChar(20), booking.guest_phone)
        .input('idCardNumber', sql.VarChar(50), String(idCardNumber).trim())
        .query(`
          INSERT INTO booking_guests (booking_id, full_name, phone, id_card_number, id_card_verified)
          VALUES (@bookingId, @fullName, @phone, @idCardNumber, 1);
        `);
    }

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
  await cancelExpiredBookings();
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
  if (activeOnly) filters.push("b.status IN ('CONFIRMED', 'CHECKED_IN')");
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
        b.created_at,
        b.special_request,
        type_summary.room_type_name,
        type_summary.room_type_id,
        room_summary.room_number,
        room_summary.assigned_room_id,
        room_summary.room_status
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
    created_at: item.created_at,
    special_request: item.special_request,
    room_type_name: item.room_type_name,
    room_type_id: item.room_type_id,
    room_number: item.room_number,
    assigned_room_id: item.assigned_room_id,
    room_status: item.room_status,
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
             WHERE br.room_type_id = @roomTypeId AND b.id <> @bookingId AND b.status <> 'CANCELLED'
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
              AND other_b.status <> 'CANCELLED'
              AND other_b.check_in_date < @checkOut AND other_b.check_out_date > @checkIn;
          `);
        if (assignedRoomConflict.recordset.length) throw new Error('The assigned room is unavailable for those dates.');
      }
    }

    const nights = calculateNights(changes.checkInDate, changes.checkOutDate);
    const totalAmount = Number(current.price_per_night) * nights;
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
  const result = await request.query(`
    UPDATE bookings SET status = 'CANCELLED'
    WHERE id = @bookingId ${ownerFilter} AND status = 'CONFIRMED'
      AND check_in_date > CONVERT(date, DATEADD(hour, 7, SYSUTCDATETIME()));
    SELECT @@ROWCOUNT AS updated_count;
  `);
  if (!result.recordset[0]?.updated_count) throw new Error('Booking not found or cannot be cancelled.');
  return { booking_id: bookingId, status: 'CANCELLED' };
}

async function cancelExpiredBookings() {
  const pool = await getPool();
  const result = await pool.request().query(`
    UPDATE bookings
    SET status = 'CANCELLED'
    WHERE status = 'CONFIRMED'
      AND DATEADD(hour, 18, CONVERT(datetime2, check_in_date)) <= DATEADD(hour, 7, SYSUTCDATETIME());
    SELECT @@ROWCOUNT AS cancelled_count;
  `);
  return Number(result.recordset[0]?.cancelled_count ?? 0);
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
              AND b.status <> 'CANCELLED'
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
                AND b.status <> 'CANCELLED'
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
      UPDATE rooms SET status = @status
      WHERE id = @roomId AND status = @currentStatus;
      SELECT @@ROWCOUNT AS updated_count;
    `);
  if (!result.recordset[0]?.updated_count) throw new Error('Room is not waiting for cleaning completion.');
  return { room_id: roomId, status };
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
  cancelExpiredBookings,
  getActiveBookings,
  checkOutBooking,
  updateRoomStatus,
  getRoomStatuses,
  getAssignableRooms,
  assignRoomToBooking,
};
