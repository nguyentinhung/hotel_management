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
      AND b.status = 'CHECKED_IN'
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

async function addServiceToCheckedInBooking({ bookingId, bookingRoomId, serviceId, quantity, items = null, customerId = null }) {
  const requestedItems = items || [{ bookingRoomId, serviceId, quantity }];
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const bookingResult = await transaction.request()
      .input('bookingId', sql.BigInt, bookingId)
      .input('customerId', sql.BigInt, customerId == null ? null : Number(customerId))
      .query(`
        SELECT b.id, b.status, b.total_amount
        FROM dbo.bookings b WITH (UPDLOCK, HOLDLOCK)
        WHERE b.id = @bookingId AND (@customerId IS NULL OR b.customer_id = @customerId)
          AND b.status = 'CHECKED_IN';
      `);
    if (!bookingResult.recordset[0]) throw Object.assign(new Error('Booking is not currently serviceable.'), { code: 'BOOKING_NOT_SERVICEABLE' });

    const invoiceResult = await transaction.request().input('bookingId', sql.BigInt, bookingId).query(`
      SELECT TOP (1) id FROM dbo.invoices WITH (UPDLOCK, HOLDLOCK)
      WHERE booking_id = @bookingId ORDER BY id DESC;
    `);
    if (invoiceResult.recordset.length) {
      throw Object.assign(new Error('Booking invoice has already been issued.'), { code: 'INVOICE_ALREADY_ISSUED' });
    }

    const savedServices = [];
    let serviceTotal = 0;
    for (const item of requestedItems) {
      const result = await transaction.request()
        .input('bookingId', sql.BigInt, bookingId)
        .input('bookingRoomId', sql.BigInt, item.bookingRoomId)
        .input('serviceId', sql.Int, item.serviceId)
        .query(`
          SELECT br.id AS booking_room_id, r.room_number,
            s.id AS service_id, s.name AS service_name, s.unit, s.price, s.booking_policy
          FROM dbo.booking_rooms br WITH (UPDLOCK, HOLDLOCK)
          JOIN dbo.bookings b WITH (UPDLOCK, HOLDLOCK) ON b.id = br.booking_id
          LEFT JOIN dbo.rooms r ON r.id = br.room_id
          JOIN dbo.services s WITH (UPDLOCK, HOLDLOCK) ON s.id = @serviceId
          WHERE b.id = @bookingId AND br.id = @bookingRoomId
            AND b.status = 'CHECKED_IN'
            AND s.is_active = 1 AND s.is_deleted = 0 AND s.booking_policy = 'ON_DEMAND';
        `);
      const row = result.recordset[0];
      if (!row) throw Object.assign(new Error('Booking room or active on-demand service was not found.'), { code: 'INVALID_SERVICEABLE_SELECTION' });

      const price = Number(row.price);
      const amount = price * item.quantity;

      // Treat an identical immediate resend as a retry instead of recording it twice.
      const retry = await transaction.request()
        .input('bookingRoomId', sql.BigInt, item.bookingRoomId)
        .input('serviceId', sql.Int, item.serviceId)
        .input('quantity', sql.Int, item.quantity)
        .input('unitPrice', sql.Decimal(18, 2), price)
        .query(`
          SELECT TOP (1) bs.id, CONVERT(varchar(23), bs.used_at, 126) AS used_at
          FROM dbo.booking_services bs WITH (UPDLOCK, HOLDLOCK)
          WHERE bs.booking_room_id = @bookingRoomId AND bs.service_id = @serviceId
            AND bs.quantity = @quantity AND bs.unit_price = @unitPrice
            AND bs.used_at >= DATEADD(second, -10, SYSUTCDATETIME())
          ORDER BY bs.id DESC;
        `);
      if (retry.recordset[0]) {
        savedServices.push({ id: retry.recordset[0].id, booking_room_id: item.bookingRoomId, room_number: row.room_number, service_id: item.serviceId, service_name: row.service_name, unit: row.unit, quantity: item.quantity, unit_price: price, amount, used_at: retry.recordset[0].used_at, duplicate_request: true });
        continue;
      }

      const insert = await transaction.request()
        .input('bookingRoomId', sql.BigInt, item.bookingRoomId)
        .input('serviceId', sql.Int, item.serviceId)
        .input('quantity', sql.Int, item.quantity)
        .input('unitPrice', sql.Decimal(18, 2), price)
        .query(`
          INSERT INTO dbo.booking_services (booking_room_id, service_id, quantity, unit_price, used_at)
          OUTPUT INSERTED.id, CONVERT(varchar(23), INSERTED.used_at, 126) AS used_at
          VALUES (@bookingRoomId, @serviceId, @quantity, @unitPrice, SYSUTCDATETIME());
        `);
      savedServices.push({ id: insert.recordset[0].id, booking_room_id: item.bookingRoomId, room_number: row.room_number, service_id: item.serviceId, service_name: row.service_name, unit: row.unit, quantity: item.quantity, unit_price: price, amount, used_at: insert.recordset[0].used_at });
      serviceTotal += amount;
    }

    let updatedTotal = Number(bookingResult.recordset[0].total_amount);
    if (serviceTotal > 0) {
      const updated = await transaction.request()
        .input('bookingId', sql.BigInt, bookingId)
        .input('serviceAmount', sql.Decimal(18, 2), serviceTotal)
        .query(`
          UPDATE dbo.bookings SET total_amount = total_amount + @serviceAmount WHERE id = @bookingId;
          SELECT total_amount FROM dbo.bookings WHERE id = @bookingId;
        `);
      updatedTotal = Number(updated.recordset[0].total_amount);
    }
    const service = savedServices[0] ? { ...savedServices[0], total_amount: updatedTotal } : null;
    const response = { service, services: savedServices, total_amount: updatedTotal };
    await transaction.commit();
    return response;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

module.exports = { getServiceableBookingRooms, getBookingServices, addServiceToCheckedInBooking };
