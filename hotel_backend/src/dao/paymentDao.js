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

module.exports = { createFinalCashPayment };
