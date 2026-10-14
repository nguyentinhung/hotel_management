const { sql, getPool } = require('../config/db');

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
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const bookingResult = await transaction.request()
      .input('customerId', sql.BigInt, customerId)
      .input('bookingCode', sql.VarChar(20), bookingCode)
      .query(`
        SELECT TOP (1) b.id, b.status, b.deposit_amount,
          CEILING(SUM(br.price_per_night) * DATEDIFF(day, b.check_in_date, b.check_out_date) * 0.30) AS required_deposit
        FROM dbo.bookings b WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.booking_rooms br ON br.booking_id = b.id
        WHERE b.customer_id = @customerId AND b.booking_code = @bookingCode
        GROUP BY b.id, b.status, b.deposit_amount, b.check_in_date, b.check_out_date;
      `);
    const booking = bookingResult.recordset[0];
    if (!booking) throw paymentError('BOOKING_NOT_FOUND', 404, 'Không tìm thấy booking của bạn.');
    if (['CANCELLED', 'NO_SHOW'].includes(String(booking.status).toUpperCase())) throw paymentError('BOOKING_UNPAYABLE', 409, 'Booking này không thể thanh toán.');
    const amount = Number(booking.required_deposit);
    if (!Number.isFinite(amount) || amount < 1) throw paymentError('INVALID_DEPOSIT', 409, 'Không tính được khoản cọc cho booking.');
    if (Number(booking.deposit_amount || 0) >= amount) throw paymentError('DEPOSIT_ALREADY_PAID', 409, 'Booking đã đủ tiền cọc.');
    const pending = await transaction.request().input('bookingId', sql.BigInt, booking.id).query(`
      SELECT TOP (1) id FROM dbo.payments WITH (UPDLOCK, HOLDLOCK)
      WHERE booking_id = @bookingId AND payment_type = 'DEPOSIT' AND status = 'PENDING';
    `);
    if (pending.recordset.length) throw paymentError('PAYMENT_ALREADY_PENDING', 409, 'Booking đã có giao dịch cọc đang chờ xử lý.');
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

async function createReceptionCheckoutPayment({ bookingId, paymentCode, method }) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const bookingResult = await transaction.request().input('bookingId', sql.BigInt, bookingId).query(`
      SELECT b.id, b.status, b.total_amount, b.deposit_amount,
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
    if (amount > 0) {
      await transaction.request()
        .input('paymentCode', sql.VarChar(30), paymentCode)
        .input('bookingId', sql.BigInt, bookingId)
        .input('amount', sql.Decimal(14, 2), amount)
        .input('method', sql.VarChar(20), method)
        .input('status', sql.VarChar(20), method === 'CASH' ? 'SUCCESS' : 'PENDING')
        .input('paidAt', sql.DateTime2, method === 'CASH' ? new Date() : null)
        .query(`
          INSERT INTO dbo.payments (payment_code, booking_id, invoice_id, amount, payment_type, method, status, paid_at)
          VALUES (@paymentCode, @bookingId, NULL, @amount, 'FINAL', @method, @status, @paidAt);
        `);
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
    return { payment_code: paymentCode, amount, status: amount === 0 || method === 'CASH' ? 'SUCCESS' : 'PENDING' };
  } catch (error) {
    try { await transaction.rollback(); } catch (rollbackError) { console.error('Checkout payment rollback error:', rollbackError); }
    throw error;
  }
}

async function completeVnpayPayment({ paymentCode, amountMinor, transactionNo, payDate, succeeded }) {
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

    // Reception checkout payments have no invoice_id. Complete checkout and
    // release the room only after VNPay confirms this final payment by IPN.
    if (succeeded && String(payment.payment_type).toUpperCase() === 'FINAL'
      && payment.invoice_id == null && String(payment.booking_status).toUpperCase() === 'CHECKED_IN') {
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
    JOIN dbo.users u ON u.id = b.customer_id
    LEFT JOIN dbo.invoices i ON i.id = p.invoice_id
    ${whereClause}
    ORDER BY p.id DESC;
  `);

  return result.recordset;
}

async function getCustomerPaymentList(customerId) {
  return getPaymentList(customerId);
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
      b.booking_code
    FROM dbo.payments p
    JOIN dbo.bookings b ON b.id = p.booking_id
    WHERE p.payment_code = @paymentCode ${ownerFilter};
  `);
  return result.recordset[0] || null;
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

module.exports = { createFinalPayment, createCustomerDepositPayment, completeSimulatedDepositPayment, createReceptionCheckoutPayment, completeVnpayPayment, getVnpayPaymentContext, getPaymentList, getCustomerPaymentList, getPaymentStatus, confirmPaymentByCode };
