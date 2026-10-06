const { sql, getPool } = require('../config/db');

async function getServiceableBookingRooms(bookingId, customerId = null) {
  const pool = await getPool();
  const request = pool.request().input('bookingId', sql.BigInt, bookingId);
  const ownerFilter = customerId == null ? '' : 'AND b.customer_id = @customerId';
  if (customerId != null) request.input('customerId', sql.BigInt, Number(customerId));
  const result = await request.query(`
    SELECT br.id AS booking_room_id, br.room_id, r.room_number
    FROM bookings b
    JOIN booking_rooms br ON br.booking_id = b.id
    LEFT JOIN rooms r ON r.id = br.room_id
    WHERE b.id = @bookingId ${ownerFilter}
      AND (b.status = 'CHECKED_IN' OR (b.status = 'CONFIRMED'
        AND CONVERT(date, SYSDATETIME()) >= b.check_in_date
        AND CONVERT(date, SYSDATETIME()) < b.check_out_date))
    ORDER BY br.id;
  `);
  return result.recordset;
}

async function getBookingServices(bookingId, customerId = null) {
  const pool = await getPool();
  const request = pool.request().input('bookingId', sql.BigInt, bookingId);
  const ownerFilter = customerId == null ? '' : 'AND b.customer_id = @customerId';
  if (customerId != null) request.input('customerId', sql.BigInt, Number(customerId));
  const result = await request.query(`
    SELECT bs.id, bs.booking_room_id, br.room_id, r.room_number, bs.service_id,
      s.name AS service_name, s.unit, bs.quantity, bs.unit_price,
      CONVERT(varchar(23), bs.used_at, 126) AS used_at,
      CAST(bs.quantity * bs.unit_price AS DECIMAL(18,2)) AS amount
    FROM booking_services bs
    JOIN booking_rooms br ON br.id = bs.booking_room_id
    JOIN bookings b ON b.id = br.booking_id
    LEFT JOIN rooms r ON r.id = br.room_id
    JOIN services s ON s.id = bs.service_id
    WHERE br.booking_id = @bookingId ${ownerFilter}
    ORDER BY bs.used_at DESC, bs.id DESC;
  `);
  return result.recordset;
}

async function addServiceToCheckedInBooking({ bookingId, bookingRoomId, serviceId, quantity, customerId = null }) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const request = transaction.request()
      .input('bookingId', sql.BigInt, bookingId)
      .input('bookingRoomId', sql.BigInt, bookingRoomId)
      .input('serviceId', sql.Int, serviceId)
      .input('quantity', sql.Int, quantity);
    const ownerFilter = customerId == null ? '' : 'AND b.customer_id = @customerId';
    if (customerId != null) request.input('customerId', sql.BigInt, Number(customerId));
    const result = await request.query(`
      SELECT b.id AS booking_id, b.status, br.id AS booking_room_id,
        s.id AS service_id, s.name AS service_name, s.unit, s.price
      FROM bookings b WITH (UPDLOCK, HOLDLOCK)
      JOIN booking_rooms br WITH (UPDLOCK, HOLDLOCK) ON br.booking_id = b.id
      JOIN services s WITH (UPDLOCK, HOLDLOCK) ON s.id = @serviceId
      WHERE b.id = @bookingId AND br.id = @bookingRoomId
        ${ownerFilter}
        AND (b.status = 'CHECKED_IN' OR (b.status = 'CONFIRMED'
          AND CONVERT(date, SYSDATETIME()) >= b.check_in_date
          AND CONVERT(date, SYSDATETIME()) < b.check_out_date))
        AND s.is_active = 1 AND s.is_deleted = 0;
    `);
    const row = result.recordset[0];
    if (!row) throw new Error('Booking room or active service was not found, or booking is not checked in.');

    const insert = await transaction.request()
      .input('bookingId', sql.BigInt, bookingId)
      .input('bookingRoomId', sql.BigInt, bookingRoomId)
      .input('serviceId', sql.Int, serviceId)
      .input('quantity', sql.Int, quantity)
      .input('unitPrice', sql.Decimal(18, 2), row.price)
      .query(`
        INSERT INTO booking_services (booking_room_id, service_id, quantity, unit_price)
        OUTPUT INSERTED.id
        VALUES (@bookingRoomId, @serviceId, @quantity, @unitPrice);
      `);
    const createdId = insert.recordset[0].id;
    const serviceAmount = Number(row.price) * quantity;
    const bookingResult = await transaction.request().input('bookingId', sql.BigInt, bookingId)
      .input('serviceAmount', sql.Decimal(18, 2), serviceAmount)
      .query(`
        UPDATE bookings SET total_amount = total_amount + @serviceAmount WHERE id = @bookingId;
        SELECT total_amount FROM bookings WHERE id = @bookingId;
      `);
    await transaction.commit();
    return {
      id: createdId,
      booking_room_id: bookingRoomId,
      service_id: serviceId,
      service_name: row.service_name,
      unit: row.unit,
      quantity,
      unit_price: Number(row.price),
      amount: serviceAmount,
      total_amount: Number(bookingResult.recordset[0].total_amount),
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

module.exports = { getServiceableBookingRooms, getBookingServices, addServiceToCheckedInBooking };
