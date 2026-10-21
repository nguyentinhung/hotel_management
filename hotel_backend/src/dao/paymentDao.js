const { sql, getPool } = require('../config/db');
const PaymentModel = require('../models/paymentModel');
const InvoiceModel = require('../models/invoiceModel');
const { expirePendingBookings } = require('./bookingDao');

function paymentError(code, statusCode, message) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

async function createFinalPayment({ customerId, bookingCode, paymentCode, method = 'CASH' }) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  let transactionStarted = false;

  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    transactionStarted = true;

    const bookingResult = await transaction.request()
      .input('customerId', sql.BigInt, customerId)
      .input('bookingCode', sql.VarChar(20), bookingCode)
      .query(`
        SELECT TOP (1)
          b.id AS booking_id,
          b.status AS booking_status,
          i.id AS invoice_id,
          i.amount_due,
          i.status AS invoice_status
        FROM dbo.bookings b WITH (UPDLOCK, HOLDLOCK)
        LEFT JOIN dbo.invoices i WITH (UPDLOCK, HOLDLOCK) ON i.booking_id = b.id
        WHERE b.customer_id = @customerId
          AND b.booking_code = @bookingCode;
      `);

    const booking = bookingResult.recordset[0];
    if (!booking) {
      throw paymentError('BOOKING_NOT_FOUND', 404, 'Không tìm thấy booking thuộc tài khoản của bạn.');
    }

    const bookingStatus = String(booking.booking_status).toUpperCase();
    if (bookingStatus === 'CANCELLED' || bookingStatus === 'NO_SHOW') {
      throw paymentError('BOOKING_UNPAYABLE', 409, 'Booking này không thể thanh toán.');
    }

    if (!booking.invoice_id || String(booking.invoice_status).toUpperCase() !== 'ISSUED') {
      throw paymentError('INVOICE_NOT_AVAILABLE', 409, 'Booking chưa có hóa đơn được phát hành để thanh toán.');
    }

    const amount = Number(booking.amount_due);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw paymentError('NO_AMOUNT_DUE', 409, 'Hóa đơn không còn khoản cần thanh toán.');
    }

    const existingPayment = await transaction.request()
      .input('bookingId', sql.BigInt, booking.booking_id)
      .input('invoiceId', sql.BigInt, booking.invoice_id)
      .query(`
        SELECT TOP (1) id
        FROM dbo.payments WITH (UPDLOCK, HOLDLOCK)
        WHERE booking_id = @bookingId
          AND invoice_id = @invoiceId
          AND payment_type = 'FINAL'
          AND status = 'PENDING';
      `);

    if (existingPayment.recordset.length) {
      throw paymentError('PAYMENT_ALREADY_PENDING', 409, 'Booking đã có yêu cầu thanh toán đang chờ xử lý.');
    }

    const paymentResult = await transaction.request()
      .input('paymentCode', sql.VarChar(30), paymentCode)
      .input('method', sql.VarChar(20), method)
      .input('bookingId', sql.BigInt, booking.booking_id)
      .input('invoiceId', sql.BigInt, booking.invoice_id)
      .input('amount', sql.Decimal(14, 2), amount)
      .query(`
        INSERT INTO dbo.payments (
          payment_code, booking_id, invoice_id, amount, payment_type, method, status
        )
        OUTPUT
          INSERTED.payment_code,
          INSERTED.amount,
          INSERTED.status
        VALUES (
          @paymentCode, @bookingId, @invoiceId, @amount, 'FINAL', @method, 'PENDING'
        );
      `);

    await transaction.commit();
    transactionStarted = false;
    return paymentResult.recordset[0];
  } catch (error) {
    if (transactionStarted) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error('Create payment rollback error:', rollbackError);
      }
    }
    throw error;
  }
}

async function createCustomerDepositPayment({ customerId, bookingCode, paymentCode, method = 'CASH', simulated = false }) {
  await expirePendingBookings();
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const bookingResult = await transaction.request()
      .input('customerId', sql.BigInt, customerId)
      .input('bookingCode', sql.VarChar(20), bookingCode)
      .query(`
        SELECT TOP (1) b.id, b.status, b.deposit_amount, b.check_in_date, b.check_out_date,
          CASE WHEN b.promotion_id IS NOT NULL THEN CEILING(b.total_amount * 0.30)
            ELSE CEILING(SUM(br.price_per_night) * DATEDIFF(day, b.check_in_date, b.check_out_date) * 0.30) END AS required_deposit
        FROM dbo.bookings b WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.booking_rooms br ON br.booking_id = b.id
        WHERE b.customer_id = @customerId AND b.booking_code = @bookingCode
        GROUP BY b.id, b.status, b.deposit_amount, b.check_in_date, b.check_out_date, b.promotion_id, b.total_amount;
      `);
    const booking = bookingResult.recordset[0];
    if (!booking) throw paymentError('BOOKING_NOT_FOUND', 404, 'Không tìm thấy booking của bạn.');
    if (['CANCELLED', 'NO_SHOW'].includes(String(booking.status).toUpperCase())) throw paymentError('BOOKING_UNPAYABLE', 409, 'Booking này không thể thanh toán.');
    if (String(booking.status).toUpperCase() !== 'PENDING_PAYMENT') throw paymentError('BOOKING_UNPAYABLE', 409, 'Booking is no longer awaiting payment.');
    const amount = Number(booking.required_deposit);
    if (!Number.isFinite(amount) || amount < 1) throw paymentError('INVALID_DEPOSIT', 409, 'Không tính được khoản cọc cho booking.');
    if (Number(booking.deposit_amount || 0) >= amount) throw paymentError('DEPOSIT_ALREADY_PAID', 409, 'Booking đã đủ tiền cọc.');
    if (String(booking.status).toUpperCase() !== 'PENDING_PAYMENT') throw paymentError('BOOKING_UNPAYABLE', 409, 'Booking is no longer awaiting payment.');
    const selectedTypes = await transaction.request().input('bookingId', sql.BigInt, booking.id).query(`
      SELECT room_type_id, COUNT(*) AS required_count FROM dbo.booking_rooms WITH (UPDLOCK, HOLDLOCK)
      WHERE booking_id = @bookingId GROUP BY room_type_id;
    `);
    let unavailable = false;
    for (const selection of selectedTypes.recordset) {
      const inventory = await transaction.request()
        .input('bookingId', sql.BigInt, booking.id).input('roomTypeId', sql.Int, selection.room_type_id)
        .input('checkIn', sql.Date, booking.check_in_date).input('checkOut', sql.Date, booking.check_out_date)
        .query(`
          SELECT
            (SELECT COUNT(*) FROM dbo.rooms r WITH (UPDLOCK, HOLDLOCK) WHERE r.room_type_id = @roomTypeId AND r.status <> 'MAINTENANCE') AS inventory_count,
            (SELECT COUNT(*) FROM dbo.booking_rooms br WITH (UPDLOCK, HOLDLOCK)
             JOIN dbo.bookings b WITH (UPDLOCK, HOLDLOCK) ON b.id = br.booking_id
             WHERE br.room_type_id = @roomTypeId AND b.id <> @bookingId
               AND b.check_in_date < @checkOut AND b.check_out_date > @checkIn
               AND (b.status = 'CHECKED_IN'
                 OR (b.status = 'PENDING_PAYMENT' AND b.created_at > DATEADD(minute, -15, SYSUTCDATETIME()))
                 OR b.status = 'CONFIRMED')
             ) AS reserved_count;
        `);
      const row = inventory.recordset[0];
      if (!row || Number(row.inventory_count) - Number(row.reserved_count) < Number(selection.required_count)) { unavailable = true; break; }
    }
    if (unavailable) {
      await transaction.request().input('bookingId', sql.BigInt, booking.id).query(`
        UPDATE dbo.bookings SET status = 'CANCELLED', cancellation_reason = 'ROOMS_UNAVAILABLE' WHERE id = @bookingId;
        UPDATE dbo.payments SET status = 'FAILED' WHERE booking_id = @bookingId AND payment_type = 'DEPOSIT' AND status = 'PENDING';
      `);
      await transaction.commit();
      throw paymentError('ROOMS_UNAVAILABLE', 409, 'The room type sold out while payment was pending. This booking was cancelled. Please choose another date or room type.');
    }
    const pending = await transaction.request().input('bookingId', sql.BigInt, booking.id).query(`
      SELECT TOP (1) payment_code, amount, status FROM dbo.payments WITH (UPDLOCK, HOLDLOCK)
      WHERE booking_id = @bookingId AND payment_type = 'DEPOSIT' AND status = 'PENDING';
    `);
    if (pending.recordset.length) {
      await transaction.commit();
      return pending.recordset[0];
    }
    const result = await transaction.request()
      .input('paymentCode', sql.VarChar(30), paymentCode)
      .input('bookingId', sql.BigInt, booking.id)
      .input('amount', sql.Decimal(14, 2), amount)
      .input('method', sql.VarChar(20), simulated ? 'VNPAY' : method)
      .input('transactionNo', sql.VarChar(100), simulated ? 'SIMULATED' : null)
      .query(`
        INSERT INTO dbo.payments (payment_code, booking_id, invoice_id, amount, payment_type, method, status, vnpay_transaction_no)
        OUTPUT INSERTED.payment_code, INSERTED.amount, INSERTED.status
        VALUES (@paymentCode, @bookingId, NULL, @amount, 'DEPOSIT', @method, 'PENDING', @transactionNo);
      `);
    await transaction.commit();
    return result.recordset[0];
  } catch (error) {
    try { await transaction.rollback(); } catch (rollbackError) { console.error('Deposit payment rollback error:', rollbackError); }
    throw error;
  }
}

async function completeSimulatedDepositPayment({ paymentCode, customerId, succeeded }) {
  await expirePendingBookings();
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  let transactionStarted = false;

  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    transactionStarted = true;

    const result = await transaction.request()
      .input('paymentCode', sql.VarChar(30), paymentCode)
      .input('customerId', sql.BigInt, customerId)
      .query(`
        SELECT TOP (1) p.id, p.booking_id, p.method, p.payment_type, p.status, p.amount, p.invoice_id,
          p.vnpay_transaction_no,
          b.customer_id, b.status AS booking_status
        FROM dbo.payments p WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.bookings b WITH (UPDLOCK, HOLDLOCK) ON b.id = p.booking_id
        WHERE p.payment_code = @paymentCode AND b.customer_id = @customerId;
      `);
    const payment = result.recordset[0];
    if (!payment) throw paymentError('PAYMENT_NOT_FOUND', 404, 'Không tìm thấy yêu cầu cọc của bạn.');
    if (String(payment.method).toUpperCase() !== 'VNPAY'
      || String(payment.vnpay_transaction_no || '').toUpperCase() !== 'SIMULATED'
      || String(payment.payment_type).toUpperCase() !== 'DEPOSIT'
      || payment.invoice_id != null) {
      throw paymentError('PAYMENT_METHOD_MISMATCH', 409, 'Yêu cầu này không phải thanh toán cọc mô phỏng.');
    }
    if (String(payment.status).toUpperCase() !== 'PENDING') {
      throw paymentError('PAYMENT_NOT_PENDING', 409, 'Yêu cầu thanh toán này đã được xử lý.');
    }
    if (['CANCELLED', 'NO_SHOW'].includes(String(payment.booking_status).toUpperCase())) {
      throw paymentError('BOOKING_UNPAYABLE', 409, 'Booking này không thể thanh toán.');
    }

    await transaction.request()
      .input('paymentCode', sql.VarChar(30), paymentCode)
      .input('status', sql.VarChar(20), succeeded ? 'SUCCESS' : 'FAILED')
      .input('paidAt', sql.DateTime2, succeeded ? new Date() : null)
      .query(`
        UPDATE dbo.payments
        SET status = @status, paid_at = @paidAt
        WHERE payment_code = @paymentCode;
      `);

    if (succeeded) {
      await transaction.request()
        .input('bookingId', sql.BigInt, payment.booking_id)
        .input('amount', sql.Decimal(14, 2), payment.amount)
        .query(`
          UPDATE dbo.bookings
          SET deposit_amount = COALESCE(deposit_amount, 0) + @amount,
              status = CASE WHEN status = 'PENDING_PAYMENT' THEN 'CONFIRMED' ELSE status END
          WHERE id = @bookingId;
        `);
    }

    await transaction.commit();
    transactionStarted = false;
    return { payment_code: paymentCode, status: succeeded ? 'SUCCESS' : 'FAILED' };
  } catch (error) {
    if (transactionStarted) {
      try { await transaction.rollback(); } catch (rollbackError) { console.error('Simulated deposit rollback error:', rollbackError); }
    }
    throw error;
  }
}

async function createReceptionCheckoutPayment({ bookingId, paymentCode, method, createdByUserId }) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const bookingResult = await transaction.request().input('bookingId', sql.BigInt, bookingId).query(`
      SELECT b.id, b.booking_code, b.status, b.total_amount, b.deposit_amount, b.discount_amount,
        COALESCE(final_payments.amount_paid, 0) AS final_paid_amount
      FROM dbo.bookings b WITH (UPDLOCK, HOLDLOCK)
      OUTER APPLY (
        SELECT SUM(p.amount) AS amount_paid
        FROM dbo.payments p
        WHERE p.booking_id = b.id AND p.payment_type = 'FINAL' AND p.status = 'SUCCESS'
      ) final_payments
      WHERE b.id = @bookingId;
    `);
    const booking = bookingResult.recordset[0];
    if (!booking) throw paymentError('BOOKING_NOT_FOUND', 404, 'Không tìm thấy booking.');
    const bookingStatus = String(booking.status).toUpperCase();
    if (!['CHECKED_IN', 'CHECKED_OUT'].includes(bookingStatus)) throw paymentError('BOOKING_NOT_CHECKED_IN', 409, 'Booking phải đang lưu trú hoặc đã checkout còn dư nợ.');
    const amount = Math.max(0, Number(booking.total_amount) - Number(booking.deposit_amount || 0) - Number(booking.final_paid_amount || 0));
    if (!Number.isFinite(amount)) throw paymentError('INVALID_AMOUNT', 409, 'Không tính được số tiền checkout.');
    const pendingPayment = await transaction.request().input('bookingId', sql.BigInt, bookingId).query(`
      SELECT TOP (1) id FROM dbo.payments WITH (UPDLOCK, HOLDLOCK)
      WHERE booking_id = @bookingId AND payment_type IN ('DEPOSIT', 'FINAL') AND status = 'PENDING';
    `);
    if (pendingPayment.recordset.length) throw paymentError('PAYMENT_ALREADY_PENDING', 409, 'Booking đang có giao dịch thanh toán chưa hoàn tất.');
    const rooms = await transaction.request().input('bookingId', sql.BigInt, bookingId).query(`
      SELECT room_id FROM dbo.booking_rooms WHERE booking_id = @bookingId AND room_id IS NOT NULL;
    `);
    let invoiceId = null;
    const existingInvoice = await transaction.request().input('bookingId', sql.BigInt, bookingId).query(`
      SELECT TOP (1) id, invoice_number FROM dbo.invoices WITH (UPDLOCK, HOLDLOCK) WHERE booking_id = @bookingId;
    `);
    let invoiceNumber = existingInvoice.recordset[0]?.invoice_number || null;
    if (existingInvoice.recordset.length) invoiceId = existingInvoice.recordset[0].id;
    if (bookingStatus === 'CHECKED_IN') {
      if (!invoiceId) {
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
        const depositPaid = Number(booking.deposit_amount || 0);
        invoiceNumber = `INV-${String(booking.booking_code).replace(/[^A-Z0-9-]/gi, '')}`;
        const created = await transaction.request()
          .input('bookingId', sql.BigInt, bookingId)
          .input('invoiceNumber', sql.VarChar(30), invoiceNumber)
          .input('roomAmount', sql.Decimal(14, 2), roomAmount)
          .input('serviceAmount', sql.Decimal(14, 2), serviceAmount)
          .input('discountAmount', sql.Decimal(14, 2), Number(booking.discount_amount || 0))
          .input('totalAmount', sql.Decimal(14, 2), Number(booking.total_amount))
          .input('depositPaid', sql.Decimal(14, 2), depositPaid)
          .input('amountDue', sql.Decimal(14, 2), method === 'CASH' ? 0 : amount)
          .input('invoiceStatus', sql.VarChar(20), method === 'CASH' || amount <= 0 ? 'PAID' : 'ISSUED')
          .input('createdByUserId', sql.BigInt, createdByUserId || null)
          .query(`
            INSERT INTO dbo.invoices
              (booking_id, invoice_number, room_amount, service_amount, discount_amount, tax_amount,
               total_amount, deposit_paid, amount_due, status, issued_at, created_by_user_id)
            OUTPUT INSERTED.id
            VALUES (@bookingId, @invoiceNumber, @roomAmount, @serviceAmount, @discountAmount, 0,
                    @totalAmount, @depositPaid, @amountDue, @invoiceStatus, SYSUTCDATETIME(), @createdByUserId);
          `);
        invoiceId = created.recordset[0].id;

        const roomItems = await transaction.request().input('bookingId', sql.BigInt, bookingId).query(`
          SELECT rt.name AS room_type_name, r.room_number, br.price_per_night,
            DATEDIFF(day, b.check_in_date, b.check_out_date) AS nights
          FROM dbo.booking_rooms br
          JOIN dbo.bookings b ON b.id = br.booking_id
          JOIN dbo.room_types rt ON rt.id = br.room_type_id
          LEFT JOIN dbo.rooms r ON r.id = br.room_id
          WHERE br.booking_id = @bookingId ORDER BY br.id;
        `);
        for (const item of roomItems.recordset) {
          const nights = Number(item.nights);
          const unitPrice = Number(item.price_per_night);
          await transaction.request()
            .input('invoiceId', sql.BigInt, invoiceId)
            .input('description', sql.NVarChar(255), `${item.room_type_name} - ${item.room_number || 'Chưa xếp'}`)
            .input('quantity', sql.Int, nights)
            .input('unitPrice', sql.Decimal(14, 2), unitPrice)
            .input('amount', sql.Decimal(14, 2), unitPrice * nights)
            .query(`INSERT INTO dbo.invoice_items (invoice_id, item_type, description, quantity, unit_price, amount)
              VALUES (@invoiceId, 'ROOM', @description, @quantity, @unitPrice, @amount);`);
        }
        const serviceItems = await transaction.request().input('bookingId', sql.BigInt, bookingId).query(`
          SELECT s.name, bs.quantity, bs.unit_price
          FROM dbo.booking_services bs JOIN dbo.booking_rooms br ON br.id = bs.booking_room_id
          JOIN dbo.services s ON s.id = bs.service_id WHERE br.booking_id = @bookingId ORDER BY bs.id;
        `);
        for (const item of serviceItems.recordset) {
          await transaction.request()
            .input('invoiceId', sql.BigInt, invoiceId)
            .input('description', sql.NVarChar(255), item.name)
            .input('quantity', sql.Int, item.quantity)
            .input('unitPrice', sql.Decimal(14, 2), item.unit_price)
            .input('amount', sql.Decimal(14, 2), Number(item.quantity) * Number(item.unit_price))
            .query(`INSERT INTO dbo.invoice_items (invoice_id, item_type, description, quantity, unit_price, amount)
              VALUES (@invoiceId, 'SERVICE', @description, @quantity, @unitPrice, @amount);`);
        }
      }
    }
    if (amount > 0) {
      await transaction.request()
        .input('paymentCode', sql.VarChar(30), paymentCode)
        .input('bookingId', sql.BigInt, bookingId)
        .input('invoiceId', sql.BigInt, invoiceId)
        .input('amount', sql.Decimal(14, 2), amount)
        .input('method', sql.VarChar(20), method)
        .input('status', sql.VarChar(20), method === 'CASH' ? 'SUCCESS' : 'PENDING')
        .query(`
          INSERT INTO dbo.payments (payment_code, booking_id, invoice_id, amount, payment_type, method, status, paid_at)
          VALUES (@paymentCode, @bookingId, @invoiceId, @amount, 'FINAL', @method, @status,
            CASE WHEN @status = 'SUCCESS' THEN SYSUTCDATETIME() ELSE NULL END);
        `);
    }
    if (invoiceId && (method === 'CASH' || amount <= 0)) {
      await transaction.request()
        .input('invoiceId', sql.BigInt, invoiceId)
        .query(`UPDATE dbo.invoices SET status = 'PAID', amount_due = 0 WHERE id = @invoiceId;`);
    }
    // For VNPay, keep the guest checked in and the room occupied until IPN
    // confirms payment. That leaves the booking retryable if the payment fails.
    if (bookingStatus === 'CHECKED_IN' && (method === 'CASH' || amount <= 0)) {
      await transaction.request().input('bookingId', sql.BigInt, bookingId).query(`UPDATE dbo.bookings SET status = 'CHECKED_OUT' WHERE id = @bookingId;`);
      for (const room of rooms.recordset) {
        if (room.room_id != null) await transaction.request().input('roomId', sql.Int, room.room_id).query(`UPDATE dbo.rooms SET status = 'CLEANING' WHERE id = @roomId AND status = 'OCCUPIED';`);
      }
    }
    await transaction.commit();
    return { payment_code: paymentCode, amount, status: amount === 0 || method === 'CASH' ? 'SUCCESS' : 'PENDING', invoice_id: invoiceId, invoice_number: invoiceNumber };
  } catch (error) {
    try { await transaction.rollback(); } catch (rollbackError) { console.error('Checkout payment rollback error:', rollbackError); }
    throw error;
  }
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
    if (!booking) throw paymentError('BOOKING_NOT_FOUND', 404, 'Không tìm thấy booking.');

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
            SET created_by_user_id = @createdByUserId
            WHERE id = @invoiceId AND created_by_user_id IS NULL;
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
      throw paymentError('BOOKING_NOT_CHECKED_IN', 409, 'Chỉ tạo hóa đơn cho booking đang lưu trú.');
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
           total_amount, deposit_paid, amount_due, status, issued_at, created_by_user_id)
        OUTPUT INSERTED.id
        VALUES (@bookingId, @invoiceNumber, @roomAmount, @serviceAmount, @discountAmount, 0,
                @totalAmount, @depositPaid, @amountDue, @invoiceStatus, SYSUTCDATETIME(), @createdByUserId);
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

async function completeVnpayPayment({ paymentCode, amountMinor, transactionNo, payDate, succeeded }) {
  await expirePendingBookings();
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  let transactionStarted = false;

  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    transactionStarted = true;

    const paymentResult = await transaction.request()
      .input('paymentCode', sql.VarChar(30), paymentCode)
      .query(`
        SELECT TOP (1) p.id, p.booking_id, b.booking_code, b.status AS booking_status, p.invoice_id, p.amount, p.payment_type, p.method, p.status, p.vnpay_transaction_no
        FROM dbo.payments p WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.bookings b ON b.id = p.booking_id
        WHERE p.payment_code = @paymentCode;
      `);
    const payment = paymentResult.recordset[0];
    if (!payment) throw paymentError('PAYMENT_NOT_FOUND', 404, 'Không tìm thấy giao dịch thanh toán.');
    if (String(payment.method).toUpperCase() !== 'VNPAY') {
      throw paymentError('PAYMENT_METHOD_MISMATCH', 409, 'Giao dịch này không được tạo bằng VNPay.');
    }
    if (String(payment.vnpay_transaction_no || '').toUpperCase() === 'SIMULATED') {
      throw paymentError('PAYMENT_METHOD_MISMATCH', 409, 'Giao dịch mô phỏng không thể hoàn tất bằng callback VNPay.');
    }
    if (Math.round(Number(payment.amount) * 100) !== Number(amountMinor)) {
      throw paymentError('PAYMENT_AMOUNT_MISMATCH', 400, 'Số tiền VNPay trả về không khớp giao dịch.');
    }
    if (String(payment.status).toUpperCase() === 'SUCCESS') {
      await transaction.commit();
      transactionStarted = false;
      return { alreadyCompleted: true, status: 'SUCCESS', paymentType: payment.payment_type, bookingCode: payment.booking_code };
    }
    if (String(payment.status).toUpperCase() !== 'PENDING') {
      throw paymentError('PAYMENT_NOT_PENDING', 409, 'Giao dịch không còn ở trạng thái chờ thanh toán.');
    }

    const nextStatus = succeeded ? 'SUCCESS' : 'FAILED';
    await transaction.request()
      .input('paymentCode', sql.VarChar(30), paymentCode)
      .input('transactionNo', sql.VarChar(100), transactionNo || null)
      .input('paidAt', sql.DateTime2, parseVnpayDate(payDate))
      .input('status', sql.VarChar(20), nextStatus)
      .query(`
        UPDATE dbo.payments
        SET status = @status,
            vnpay_transaction_no = @transactionNo,
            paid_at = CASE WHEN @status = 'SUCCESS' THEN @paidAt ELSE NULL END
        WHERE payment_code = @paymentCode;
      `);

    if (succeeded && payment.invoice_id) {
      await transaction.request()
        .input('invoiceId', sql.BigInt, payment.invoice_id)
        .query(`
          UPDATE dbo.invoices
          SET status = 'PAID', amount_due = 0
          WHERE id = @invoiceId AND status = 'ISSUED';
        `);
    }

    if (succeeded && String(payment.payment_type).toUpperCase() === 'DEPOSIT') {
      await transaction.request()
        .input('bookingId', sql.BigInt, payment.booking_id)
        .input('amount', sql.Decimal(14, 2), payment.amount)
        .query(`
          UPDATE dbo.bookings
          SET deposit_amount = COALESCE(deposit_amount, 0) + @amount,
              status = CASE WHEN status = 'PENDING_PAYMENT' THEN 'CONFIRMED' ELSE status END
          WHERE id = @bookingId;
        `);
    }

    // Complete checkout and release the room only after VNPay verifies the
    // final payment. Reception checkout payments can be linked to an invoice.
    if (succeeded && String(payment.payment_type).toUpperCase() === 'FINAL'
      && String(payment.booking_status).toUpperCase() === 'CHECKED_IN') {
      await transaction.request()
        .input('bookingId', sql.BigInt, payment.booking_id)
        .query(`UPDATE dbo.bookings SET status = 'CHECKED_OUT' WHERE id = @bookingId;`);
      await transaction.request()
        .input('bookingId', sql.BigInt, payment.booking_id)
        .query(`
          UPDATE dbo.rooms
          SET status = 'CLEANING'
          WHERE status = 'OCCUPIED'
            AND id IN (SELECT room_id FROM dbo.booking_rooms WHERE booking_id = @bookingId AND room_id IS NOT NULL);
        `);
    }

    await transaction.commit();
    transactionStarted = false;
    return { alreadyCompleted: false, status: nextStatus, paymentType: payment.payment_type, bookingCode: payment.booking_code };
  } catch (error) {
    if (transactionStarted) {
      try { await transaction.rollback(); } catch (rollbackError) {
        console.error('VNPay callback rollback error:', rollbackError);
      }
    }
    throw error;
  }
}

async function getVnpayPaymentContext({ paymentCode, amountMinor }) {
  const pool = await getPool();
  const result = await pool.request()
    .input('paymentCode', sql.VarChar(30), paymentCode)
    .query(`
      SELECT TOP (1) p.payment_type, p.amount, p.status, b.booking_code
      FROM dbo.payments p JOIN dbo.bookings b ON b.id = p.booking_id
      WHERE p.payment_code = @paymentCode AND p.method = 'VNPAY';
    `);
  const payment = result.recordset[0];
  if (!payment) throw paymentError('PAYMENT_NOT_FOUND', 404, 'Không tìm thấy giao dịch VNPay.');
  if (Math.round(Number(payment.amount) * 100) !== Number(amountMinor)) throw paymentError('PAYMENT_AMOUNT_MISMATCH', 400, 'Số tiền VNPay trả về không khớp giao dịch.');
  return { paymentType: payment.payment_type, bookingCode: payment.booking_code, status: payment.status };
}

function parseVnpayDate(value) {
  if (!/^\d{14}$/.test(String(value || ''))) return new Date();
  const text = String(value);
  // VNPay sends GMT+7 time without a timezone suffix.
  return new Date(Date.UTC(
    Number(text.slice(0, 4)), Number(text.slice(4, 6)) - 1, Number(text.slice(6, 8)),
    Number(text.slice(8, 10)) - 7, Number(text.slice(10, 12)), Number(text.slice(12, 14)),
  ));
}

async function getPaymentList(customerId = null, successOnly = false) {
  const pool = await getPool();
  const request = pool.request();
  const filters = [];

  if (customerId !== null) {
    request.input('customerId', sql.BigInt, customerId);
    filters.push('b.customer_id = @customerId');
  }
  if (successOnly) filters.push("p.status = 'SUCCESS'");
  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const result = await request.query(`
    SELECT
      p.payment_code,
      b.booking_code,
      b.guest_full_name,
      b.guest_phone,
      b.guest_email,
      b.check_in_date,
      b.check_out_date,
      b.adults,
      b.children,
      b.status AS booking_status,
      b.total_amount AS booking_total_amount,
      b.deposit_amount AS booking_deposit_amount,
      u.full_name AS customer_full_name,
      u.email AS customer_email,
      u.phone AS customer_phone,
      JSON_QUERY((
        SELECT
          rt.name AS room_type_name,
          r.room_number,
          r.floor,
          r.status AS room_status,
          br.price_per_night,
          rt.max_adults,
          rt.max_children,
          (
            SELECT TOP (1) rti.image_url
            FROM dbo.room_type_images rti
            WHERE rti.room_type_id = rt.id AND rti.is_primary = 1
            ORDER BY rti.id
          ) AS image_url
        FROM dbo.booking_rooms br
        JOIN dbo.room_types rt ON rt.id = br.room_type_id
        LEFT JOIN dbo.rooms r ON r.id = br.room_id
        WHERE br.booking_id = b.id
        ORDER BY br.id
        FOR JSON PATH
      )) AS booking_rooms,
      JSON_QUERY((
        SELECT
          bg.full_name,
          bg.phone,
          bg.id_card_number,
          bg.id_card_verified
        FROM dbo.booking_guests bg
        WHERE bg.booking_id = b.id
        ORDER BY bg.id
        FOR JSON PATH
      )) AS booking_guests,
      i.invoice_number,
      i.room_amount AS invoice_room_amount,
      i.service_amount AS invoice_service_amount,
      i.discount_amount AS invoice_discount_amount,
      i.tax_amount AS invoice_tax_amount,
      i.total_amount AS invoice_total_amount,
      i.deposit_paid AS invoice_deposit_paid,
      i.amount_due AS invoice_amount_due,
      i.status AS invoice_status,
      i.issued_at AS invoice_issued_at,
      JSON_QUERY((
        SELECT
          ii.item_type,
          ii.description,
          ii.quantity,
          ii.unit_price,
          ii.amount
        FROM dbo.invoice_items ii
        WHERE ii.invoice_id = i.id
        ORDER BY ii.id
        FOR JSON PATH
      )) AS invoice_items,
      p.payment_type,
      p.method,
      p.amount,
      p.status,
      p.paid_at,
      p.vnpay_transaction_no
    FROM dbo.payments p
    JOIN dbo.bookings b ON b.id = p.booking_id
    LEFT JOIN dbo.users u ON u.id = b.customer_id
    LEFT JOIN dbo.invoices i ON i.id = p.invoice_id
    ${whereClause}
    ORDER BY p.id DESC;
  `);

  return PaymentModel.fromRows(result.recordset);
}

async function getCustomerPaymentList(customerId) {
  return getPaymentList(customerId);
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
  return InvoiceModel.fromRows(result.recordset);
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
      creator.full_name AS created_by_full_name,
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
    WHERE i.id = @invoiceId ${customerFilter};
  `);
  return result.recordset[0] || null;
}

async function getPaymentStatus({ paymentCode, customerId = null }) {
  const pool = await getPool();
  const request = pool.request().input('paymentCode', sql.VarChar(30), paymentCode);
  const ownerFilter = customerId == null ? '' : 'AND b.customer_id = @customerId';
  if (customerId != null) request.input('customerId', sql.BigInt, customerId);
  const result = await request.query(`
    SELECT TOP (1)
      p.payment_code,
      p.status,
      p.payment_type,
      p.amount,
      b.booking_code,
      p.invoice_id
    FROM dbo.payments p
    JOIN dbo.bookings b ON b.id = p.booking_id
    WHERE p.payment_code = @paymentCode ${ownerFilter};
  `);
  return PaymentModel.fromRow(result.recordset[0]);
}

async function confirmPaymentByCode(paymentCode) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  let transactionStarted = false;

  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    transactionStarted = true;

    const paymentResult = await transaction.request()
      .input('paymentCode', sql.VarChar(30), paymentCode)
      .query(`
        SELECT TOP (1)
          p.id,
          p.booking_id,
          p.invoice_id,
          p.amount,
          p.payment_type,
          p.method,
          p.status,
          i.amount_due,
          i.total_amount,
          i.deposit_paid
        FROM dbo.payments p WITH (UPDLOCK, HOLDLOCK)
        LEFT JOIN dbo.invoices i WITH (UPDLOCK, HOLDLOCK) ON i.id = p.invoice_id
        WHERE p.payment_code = @paymentCode;
      `);

    const payment = paymentResult.recordset[0];
    if (!payment) {
      const error = new Error('Không tìm thấy giao dịch thanh toán.');
      error.statusCode = 404;
      throw error;
    }

    if (String(payment.method).toUpperCase() !== 'CASH') {
      const error = new Error('VNPay transactions are confirmed by the verified callback.');
      error.statusCode = 409;
      throw error;
    }

    if (String(payment.status).toUpperCase() !== 'PENDING') {
      const error = new Error('Giao dịch này không còn ở trạng thái chờ xác nhận.');
      error.statusCode = 409;
      throw error;
    }

    await transaction.request()
      .input('paymentCode', sql.VarChar(30), paymentCode)
      .input('paidAt', sql.DateTime2, new Date())
      .query(`
        UPDATE dbo.payments
        SET status = 'SUCCESS', paid_at = @paidAt
        WHERE payment_code = @paymentCode;
      `);

    if (payment.invoice_id) {
      const nextInvoiceStatus = String(payment.payment_type).toUpperCase() === 'FINAL' ? 'PAID' : 'ISSUED';
      if (String(payment.payment_type).toUpperCase() === 'FINAL') {
        await transaction.request()
          .input('invoiceId', sql.BigInt, payment.invoice_id)
          .query(`
            UPDATE dbo.invoices
            SET status = 'PAID', amount_due = 0
            WHERE id = @invoiceId;
          `);
      } else {
        await transaction.request()
          .input('invoiceId', sql.BigInt, payment.invoice_id)
          .input('amount', sql.Decimal(14, 2), payment.amount)
          .query(`
            UPDATE dbo.invoices
            SET deposit_paid = deposit_paid + @amount,
                amount_due = CASE WHEN total_amount - (deposit_paid + @amount) > 0 THEN total_amount - (deposit_paid + @amount) ELSE 0 END,
                status = CASE WHEN total_amount - (deposit_paid + @amount) > 0 THEN 'ISSUED' ELSE 'PAID' END
            WHERE id = @invoiceId;
          `);
      }
    }

    if (String(payment.payment_type).toUpperCase() === 'DEPOSIT' && payment.invoice_id == null) {
      await transaction.request()
        .input('bookingId', sql.BigInt, payment.booking_id)
        .input('amount', sql.Decimal(14, 2), payment.amount)
        .query(`
          UPDATE dbo.bookings
          SET deposit_amount = COALESCE(deposit_amount, 0) + @amount,
              status = CASE WHEN status = 'PENDING_PAYMENT' THEN 'CONFIRMED' ELSE status END
          WHERE id = @bookingId;
        `);
    }

    await transaction.commit();
    transactionStarted = false;
    return { payment_code: paymentCode, status: 'SUCCESS' };
  } catch (error) {
    if (transactionStarted) {
      try { await transaction.rollback(); } catch (rollbackError) { console.error('Confirm payment rollback error:', rollbackError); }
    }
    throw error;
  }
}

module.exports = { createFinalPayment, createCustomerDepositPayment, completeSimulatedDepositPayment, createReceptionCheckoutPayment, createReceptionInvoice, completeVnpayPayment, getVnpayPaymentContext, getPaymentList, getCustomerPaymentList, getInvoiceList, getInvoiceDetails, getPaymentStatus, confirmPaymentByCode };
