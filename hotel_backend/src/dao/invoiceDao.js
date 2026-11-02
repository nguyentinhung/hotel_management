const { sql, getPool } = require('../config/db');

function invoiceError(code, statusCode, message) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

async function createReceptionInvoice(bookingId, createdByUserId) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const bookingResult = await transaction.request().input('bookingId', sql.BigInt, bookingId).query(`
      SELECT b.id, b.booking_code, b.status, b.total_amount, b.deposit_amount, b.discount_amount,
        COALESCE(final_payments.amount_paid, 0) AS final_paid_amount
      FROM dbo.bookings b WITH (UPDLOCK, HOLDLOCK)
      OUTER APPLY (
        SELECT SUM(p.amount) AS amount_paid FROM dbo.payments p
        WHERE p.booking_id = b.id AND p.payment_type = 'FINAL' AND p.status = 'SUCCESS'
      ) final_payments
      WHERE b.id = @bookingId;
    `);
    const booking = bookingResult.recordset[0];
    if (!booking) throw invoiceError('BOOKING_NOT_FOUND', 404, 'Không tìm thấy booking.');

    const existing = await transaction.request().input('bookingId', sql.BigInt, bookingId).query(`
      SELECT TOP (1) id, invoice_number, status
      FROM dbo.invoices WITH (UPDLOCK, HOLDLOCK)
      WHERE booking_id = @bookingId ORDER BY id DESC;
    `);
    if (existing.recordset.length) {
      if (createdByUserId) {
        await transaction.request()
          .input('invoiceId', sql.BigInt, existing.recordset[0].id)
          .input('createdByUserId', sql.BigInt, createdByUserId)
          .query(`
            UPDATE dbo.invoices
            SET created_by_user_id = COALESCE(created_by_user_id, @createdByUserId),
                created_by_full_name = COALESCE(created_by_full_name,
                  (SELECT COALESCE(NULLIF(users.full_name, N''), roles.name)
                   FROM dbo.users AS users LEFT JOIN dbo.roles AS roles ON roles.id = users.role_id
                   WHERE users.id = @createdByUserId)),
                created_by_staff_id = COALESCE(created_by_staff_id,
                  (SELECT id FROM dbo.staff WHERE user_id = @createdByUserId))
            WHERE id = @invoiceId
              AND (created_by_user_id IS NULL OR created_by_full_name IS NULL OR created_by_staff_id IS NULL);
          `);
      }
      // Repair older invoices or invoices missing newly added booking items.
      // Match each booking line to an invoice line by its stored values and
      // occurrence number, so retries add only genuinely missing rows.
      await transaction.request()
        .input('bookingId', sql.BigInt, bookingId)
        .input('invoiceId', sql.BigInt, existing.recordset[0].id)
        .query(`
          ;WITH ExpectedRooms AS (
            SELECT
              CONCAT(rt.name, N' - ', COALESCE(r.room_number, N'Chưa xếp')) AS description,
              nights.night_count AS quantity,
              br.price_per_night AS unit_price,
              br.price_per_night * nights.night_count AS amount,
              ROW_NUMBER() OVER (
                PARTITION BY nights.night_count, br.price_per_night, br.price_per_night * nights.night_count
                ORDER BY br.id
              ) AS occurrence
            FROM dbo.booking_rooms br
            JOIN dbo.bookings b ON b.id = br.booking_id
            JOIN dbo.room_types rt ON rt.id = br.room_type_id
            LEFT JOIN dbo.rooms r ON r.id = br.room_id
            CROSS APPLY (SELECT DATEDIFF(day, b.check_in_date, b.check_out_date) AS night_count) nights
            WHERE br.booking_id = @bookingId
          ), ExpectedRoomCounts AS (
            SELECT quantity, unit_price, amount, COUNT(*) AS expected_count
            FROM ExpectedRooms
            GROUP BY quantity, unit_price, amount
          ), ExistingRooms AS (
            SELECT ii.id, ii.quantity, ii.unit_price, ii.amount,
              ROW_NUMBER() OVER (
                PARTITION BY ii.quantity, ii.unit_price, ii.amount
                ORDER BY CASE WHEN EXISTS (
                  SELECT 1 FROM ExpectedRooms expected
                  WHERE expected.description = ii.description
                    AND expected.quantity = ii.quantity
                    AND expected.unit_price = ii.unit_price
                    AND expected.amount = ii.amount
                ) THEN 0 ELSE 1 END, ii.id
              ) AS occurrence
            FROM dbo.invoice_items ii
            WHERE ii.invoice_id = @invoiceId AND ii.item_type = 'ROOM'
          )
          DELETE item
          FROM dbo.invoice_items item
          JOIN ExistingRooms existing ON existing.id = item.id
          JOIN ExpectedRoomCounts expected
            ON expected.quantity = existing.quantity
            AND expected.unit_price = existing.unit_price
            AND expected.amount = existing.amount
          WHERE existing.occurrence > expected.expected_count;

          ;WITH ExpectedRooms AS (
            SELECT
              CONCAT(rt.name, N' - ', COALESCE(r.room_number, N'Chưa xếp')) AS description,
              nights.night_count AS quantity,
              br.price_per_night AS unit_price,
              br.price_per_night * nights.night_count AS amount,
              ROW_NUMBER() OVER (
                PARTITION BY nights.night_count, br.price_per_night, br.price_per_night * nights.night_count
                ORDER BY br.id
              ) AS occurrence
            FROM dbo.booking_rooms br
            JOIN dbo.bookings b ON b.id = br.booking_id
            JOIN dbo.room_types rt ON rt.id = br.room_type_id
            LEFT JOIN dbo.rooms r ON r.id = br.room_id
            CROSS APPLY (SELECT DATEDIFF(day, b.check_in_date, b.check_out_date) AS night_count) nights
            WHERE br.booking_id = @bookingId
          ), ExistingRooms AS (
            SELECT quantity, unit_price, amount, COUNT(*) AS row_count
            FROM dbo.invoice_items
            WHERE invoice_id = @invoiceId AND item_type = 'ROOM'
            GROUP BY quantity, unit_price, amount
          )
          INSERT INTO dbo.invoice_items (invoice_id, item_type, description, quantity, unit_price, amount)
          SELECT @invoiceId, 'ROOM', expected.description, expected.quantity, expected.unit_price, expected.amount
          FROM ExpectedRooms expected
          LEFT JOIN ExistingRooms existing
            ON existing.quantity = expected.quantity
            AND existing.unit_price = expected.unit_price
            AND existing.amount = expected.amount
          WHERE expected.occurrence > COALESCE(existing.row_count, 0);

          ;WITH ExpectedServices AS (
            SELECT s.name AS description, bs.quantity, bs.unit_price,
              bs.quantity * bs.unit_price AS amount,
              ROW_NUMBER() OVER (
                PARTITION BY s.name, bs.quantity, bs.unit_price
                ORDER BY bs.id
              ) AS occurrence
            FROM dbo.booking_services bs
            JOIN dbo.booking_rooms br ON br.id = bs.booking_room_id
            JOIN dbo.services s ON s.id = bs.service_id
            WHERE br.booking_id = @bookingId
          ), ExistingServices AS (
            SELECT description, quantity, unit_price, amount, COUNT(*) AS row_count
            FROM dbo.invoice_items
            WHERE invoice_id = @invoiceId AND item_type = 'SERVICE'
            GROUP BY description, quantity, unit_price, amount
          )
          INSERT INTO dbo.invoice_items (invoice_id, item_type, description, quantity, unit_price, amount)
          SELECT @invoiceId, 'SERVICE', expected.description, expected.quantity, expected.unit_price, expected.amount
          FROM ExpectedServices expected
          LEFT JOIN ExistingServices existing
            ON existing.description = expected.description
            AND existing.quantity = expected.quantity
            AND existing.unit_price = expected.unit_price
            AND existing.amount = expected.amount
          WHERE expected.occurrence > COALESCE(existing.row_count, 0);
        `);
      await transaction.commit();
      return { invoice_id: Number(existing.recordset[0].id), invoice_number: existing.recordset[0].invoice_number, status: existing.recordset[0].status, created: false };
    }
    if (String(booking.status).toUpperCase() !== 'CHECKED_IN') {
      throw invoiceError('BOOKING_NOT_CHECKED_IN', 409, 'Chỉ tạo hóa đơn cho booking đang lưu trú.');
    }

    const totals = await transaction.request().input('bookingId', sql.BigInt, bookingId).query(`
      SELECT
        COALESCE((SELECT SUM(br.price_per_night)
          FROM dbo.booking_rooms br WHERE br.booking_id = b.id), 0)
          * DATEDIFF(day, b.check_in_date, b.check_out_date) AS room_amount,
        COALESCE((SELECT SUM(bs.quantity * bs.unit_price)
          FROM dbo.booking_services bs JOIN dbo.booking_rooms br ON br.id = bs.booking_room_id
          WHERE br.booking_id = b.id), 0) AS service_amount
      FROM dbo.bookings b WHERE b.id = @bookingId;
    `);
    const roomAmount = Number(totals.recordset[0].room_amount);
    const serviceAmount = Number(totals.recordset[0].service_amount);
    const totalAmount = Number(booking.total_amount);
    const depositPaid = Number(booking.deposit_amount || 0);
    const discountAmount = Number(booking.discount_amount || 0);
    const amountDue = Math.max(0, totalAmount - depositPaid - Number(booking.final_paid_amount || 0));
    const invoiceStatus = amountDue <= 0 ? 'PAID' : 'ISSUED';
    const invoiceNumber = `INV-${String(booking.booking_code).replace(/[^A-Z0-9-]/gi, '')}`;
    const invoiceResult = await transaction.request()
      .input('bookingId', sql.BigInt, bookingId)
      .input('invoiceNumber', sql.VarChar(30), invoiceNumber)
      .input('roomAmount', sql.Decimal(14, 2), roomAmount)
      .input('serviceAmount', sql.Decimal(14, 2), serviceAmount)
      .input('discountAmount', sql.Decimal(14, 2), discountAmount)
      .input('totalAmount', sql.Decimal(14, 2), totalAmount)
      .input('depositPaid', sql.Decimal(14, 2), depositPaid)
      .input('amountDue', sql.Decimal(14, 2), amountDue)
      .input('invoiceStatus', sql.VarChar(20), invoiceStatus)
      .input('createdByUserId', sql.BigInt, createdByUserId || null)
      .query(`
        INSERT INTO dbo.invoices
          (booking_id, invoice_number, room_amount, service_amount, discount_amount, tax_amount,
           total_amount, deposit_paid, amount_due, status, issued_at,
           created_by_user_id, created_by_full_name, created_by_staff_id)
        OUTPUT INSERTED.id
        VALUES (@bookingId, @invoiceNumber, @roomAmount, @serviceAmount, @discountAmount, 0,
                @totalAmount, @depositPaid, @amountDue, @invoiceStatus, SYSUTCDATETIME(), @createdByUserId,
                (SELECT COALESCE(NULLIF(users.full_name, N''), roles.name)
                 FROM dbo.users AS users LEFT JOIN dbo.roles AS roles ON roles.id = users.role_id
                 WHERE users.id = @createdByUserId),
                (SELECT id FROM dbo.staff WHERE user_id = @createdByUserId));
      `);
    const invoiceId = invoiceResult.recordset[0].id;

    await transaction.request().input('bookingId', sql.BigInt, bookingId).input('invoiceId', sql.BigInt, invoiceId).query(`
      INSERT INTO dbo.invoice_items (invoice_id, item_type, description, quantity, unit_price, amount)
      SELECT @invoiceId, 'ROOM',
        CONCAT(rt.name, N' - ', COALESCE(r.room_number, N'Chưa xếp')),
        nights.night_count, br.price_per_night, br.price_per_night * nights.night_count
      FROM dbo.booking_rooms br
      JOIN dbo.bookings b ON b.id = br.booking_id
      JOIN dbo.room_types rt ON rt.id = br.room_type_id
      LEFT JOIN dbo.rooms r ON r.id = br.room_id
      CROSS APPLY (SELECT DATEDIFF(day, b.check_in_date, b.check_out_date) AS night_count) nights
      WHERE br.booking_id = @bookingId;

      INSERT INTO dbo.invoice_items (invoice_id, item_type, description, quantity, unit_price, amount)
      SELECT @invoiceId, 'SERVICE', s.name, bs.quantity, bs.unit_price, bs.quantity * bs.unit_price
      FROM dbo.booking_services bs
      JOIN dbo.booking_rooms br ON br.id = bs.booking_room_id
      JOIN dbo.services s ON s.id = bs.service_id
      WHERE br.booking_id = @bookingId;
    `);

    await transaction.commit();
    return { invoice_id: Number(invoiceId), invoice_number: invoiceNumber, status: invoiceStatus, created: true };
  } catch (error) {
    try { await transaction.rollback(); } catch (rollbackError) { console.error('Invoice creation rollback error:', rollbackError); }
    throw error;
  }
}

async function getInvoiceList(customerId = null) {
  const pool = await getPool();
  const request = pool.request();
  const customerFilter = customerId == null ? '' : 'AND b.customer_id = @customerId';
  if (customerId != null) request.input('customerId', sql.BigInt, customerId);
  const result = await request.query(`
    SELECT i.id, i.invoice_number, i.room_amount, i.service_amount, i.discount_amount,
      i.tax_amount, i.total_amount, i.deposit_paid, i.amount_due, i.status, i.issued_at,
      b.booking_code, b.check_in_date, b.check_out_date, b.guest_full_name, b.guest_phone,
      b.guest_email, u.full_name AS customer_full_name, u.email AS customer_email,
      u.phone AS customer_phone,
      JSON_QUERY((SELECT ii.item_type, ii.description, ii.quantity, ii.unit_price, ii.amount
        FROM dbo.invoice_items ii WHERE ii.invoice_id = i.id ORDER BY ii.id FOR JSON PATH)) AS items
    FROM dbo.invoices i
    JOIN dbo.bookings b ON b.id = i.booking_id
    LEFT JOIN dbo.users u ON u.id = b.customer_id
    WHERE 1 = 1 ${customerFilter}
    ORDER BY i.issued_at DESC, i.id DESC;
  `);
  return result.recordset;
}

async function getInvoiceDetails(invoiceId, customerId = null) {
  const pool = await getPool();
  const request = pool.request().input('invoiceId', sql.BigInt, invoiceId);
  const customerFilter = customerId == null ? '' : 'AND b.customer_id = @customerId';
  if (customerId != null) request.input('customerId', sql.BigInt, customerId);
  const result = await request.query(`
    SELECT i.id, i.invoice_number, i.room_amount, i.service_amount, i.discount_amount,
      i.tax_amount, i.total_amount, i.deposit_paid, i.amount_due, i.status, i.issued_at,
      b.booking_code, b.status AS booking_status, b.check_in_date, b.check_out_date,
      b.guest_full_name, b.guest_phone, b.guest_email, b.adults, b.children,
      b.special_request,
      COALESCE(NULLIF(LTRIM(RTRIM(i.created_by_full_name)), N''),
        NULLIF(LTRIM(RTRIM(creator.full_name)), N''), creator_role.name) AS created_by_full_name,
      (SELECT TOP (1) bg.id_card_number FROM dbo.booking_guests bg
        WHERE bg.booking_id = b.id ORDER BY bg.id) AS guest_id_card_number,
      u.full_name AS customer_full_name, u.email AS customer_email, u.phone AS customer_phone,
      JSON_QUERY((SELECT ii.item_type,
        ii.description,
        CASE WHEN ii.item_type = 'SERVICE' THEN (
          SELECT matched.room_number
          FROM (
            SELECT s.name AS description, bs.quantity, bs.unit_price, r.room_number,
              ROW_NUMBER() OVER (
                PARTITION BY s.name, bs.quantity, bs.unit_price
                ORDER BY bs.id
              ) AS occurrence
            FROM dbo.booking_services bs
            JOIN dbo.booking_rooms br ON br.id = bs.booking_room_id
            JOIN dbo.services s ON s.id = bs.service_id
            LEFT JOIN dbo.rooms r ON r.id = br.room_id
            WHERE br.booking_id = b.id
          ) matched
          WHERE matched.description = ii.description
            AND matched.quantity = ii.quantity
            AND matched.unit_price = ii.unit_price
            AND matched.occurrence = (
              SELECT COUNT(*) FROM dbo.invoice_items previous
              WHERE previous.invoice_id = ii.invoice_id
                AND previous.item_type = 'SERVICE'
                AND previous.description = ii.description
                AND previous.quantity = ii.quantity
                AND previous.unit_price = ii.unit_price
                AND previous.id <= ii.id
            )
        ) END AS room_number,
        ii.quantity, ii.unit_price, ii.amount
        FROM dbo.invoice_items ii WHERE ii.invoice_id = i.id ORDER BY ii.id FOR JSON PATH)) AS items,
      JSON_QUERY((SELECT p.payment_code, p.payment_type, p.method, p.amount, p.status,
        p.paid_at, p.vnpay_transaction_no
        FROM dbo.payments p
        WHERE p.invoice_id = i.id
          OR (p.invoice_id IS NULL AND p.booking_id = b.id)
        ORDER BY p.paid_at DESC, p.id DESC FOR JSON PATH)) AS payments,
      JSON_QUERY((SELECT r.room_number, r.floor, r.status AS room_status, rt.name AS room_type_name
        FROM dbo.booking_rooms br
        JOIN dbo.room_types rt ON rt.id = br.room_type_id
        LEFT JOIN dbo.rooms r ON r.id = br.room_id
        WHERE br.booking_id = b.id ORDER BY br.id FOR JSON PATH)) AS rooms
    FROM dbo.invoices i
    JOIN dbo.bookings b ON b.id = i.booking_id
    LEFT JOIN dbo.users u ON u.id = b.customer_id
    LEFT JOIN dbo.users creator ON creator.id = i.created_by_user_id
    LEFT JOIN dbo.roles creator_role ON creator_role.id = creator.role_id
    WHERE i.id = @invoiceId ${customerFilter};
  `);
  return result.recordset[0] || null;
}

module.exports = { createReceptionInvoice, getInvoiceList, getInvoiceDetails };
