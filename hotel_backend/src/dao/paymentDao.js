const { sql, getPool } = require('../config/db');

function paymentError(code, statusCode, message) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

async function createFinalCashPayment({ customerId, bookingCode, paymentCode }) {
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
          @paymentCode, @bookingId, @invoiceId, @amount, 'FINAL', 'CASH', 'PENDING'
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

async function getPaymentList(customerId = null) {
  const pool = await getPool();
  const request = pool.request();
  let customerFilter = '';

  if (customerId !== null) {
    request.input('customerId', sql.BigInt, customerId);
    customerFilter = 'WHERE b.customer_id = @customerId';
  }

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
    ${customerFilter}
    ORDER BY p.id DESC;
  `);

  return result.recordset;
}

async function getCustomerPaymentList(customerId) {
  return getPaymentList(customerId);
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

module.exports = { createFinalCashPayment, getPaymentList, getCustomerPaymentList, confirmPaymentByCode };
