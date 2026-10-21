const { sql, getPool } = require('../config/db');
const ReviewModel = require('../models/reviewModel');

function normalizeReview(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    room_type_id: row.room_type_id == null ? null : Number(row.room_type_id),
    rating: Number(row.rating),
    comment: row.comment ?? '',
    is_hidden: Boolean(row.is_hidden),
    customer_name: row.customer_name,
    room_type_name: row.room_type_name ?? null,
    ...(row.booking_id == null ? {} : { booking_id: Number(row.booking_id) }),
    ...(row.customer_id == null ? {} : { customer_id: Number(row.customer_id) }),
  };
}

async function listDashboardReviews(includeHidden) {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT r.id, r.room_type_id, r.rating, r.comment, r.is_hidden,
           u.full_name AS customer_name, rt.name AS room_type_name
    FROM dbo.reviews r
    JOIN dbo.users u ON u.id = r.customer_id
    LEFT JOIN dbo.room_types rt ON rt.id = r.room_type_id
    ${includeHidden ? '' : 'WHERE r.is_hidden = 0'}
    ORDER BY r.id DESC;
  `);
  return ReviewModel.fromRows(result.recordset.map(normalizeReview));
}

async function listCustomerBookings(customerId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('customerId', sql.BigInt, customerId)
    .query(`
      SELECT b.id AS booking_id, b.booking_code, b.status,
             b.check_in_date, b.check_out_date,
             COUNT(DISTINCT br.room_type_id) AS room_type_count,
             MIN(br.room_type_id) AS room_type_id,
             MIN(rt.name) AS room_type_name,
             CAST(CASE WHEN b.status IN ('CHECKED_IN', 'CHECKED_OUT')
               AND COALESCE(b.deposit_amount, 0) + COALESCE(payment_summary.final_paid_amount, 0) >= COALESCE(b.total_amount, 0)
               AND COALESCE(payment_summary.has_pending_payment, 0) = 0 THEN 1 ELSE 0 END AS bit) AS can_review,
             r.id AS review_id, r.rating AS review_rating, r.comment AS review_comment
      FROM dbo.bookings b
      LEFT JOIN dbo.booking_rooms br ON br.booking_id = b.id
      LEFT JOIN dbo.room_types rt ON rt.id = br.room_type_id
      LEFT JOIN dbo.reviews r ON r.booking_id = b.id AND r.customer_id = b.customer_id
      OUTER APPLY (
        SELECT SUM(CASE WHEN p.payment_type = 'FINAL' AND p.status = 'SUCCESS' THEN p.amount ELSE 0 END) AS final_paid_amount,
               MAX(CASE WHEN p.status = 'PENDING' THEN 1 ELSE 0 END) AS has_pending_payment
        FROM dbo.payments p WHERE p.booking_id = b.id
      ) payment_summary
      WHERE b.customer_id = @customerId
      GROUP BY b.id, b.booking_code, b.status, b.check_in_date, b.check_out_date,
               b.deposit_amount, b.total_amount, payment_summary.final_paid_amount,
               payment_summary.has_pending_payment, r.id, r.rating, r.comment
      ORDER BY b.id DESC;
    `);
  return result.recordset.map((row) => ({
    booking_id: Number(row.booking_id),
    booking_code: row.booking_code,
    status: row.status,
    check_in_date: row.check_in_date,
    check_out_date: row.check_out_date,
    room_type_count: Number(row.room_type_count),
    room_type_id: row.room_type_count === 1 ? Number(row.room_type_id) : null,
    room_type_name: row.room_type_count === 1 ? row.room_type_name : null,
    can_review: Boolean(row.can_review),
    review: row.review_id == null ? null : {
      id: Number(row.review_id), rating: Number(row.review_rating), comment: row.review_comment ?? '',
    },
  }));
}

async function getCustomerReview(reviewId, customerId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('reviewId', sql.BigInt, reviewId)
    .input('customerId', sql.BigInt, customerId)
    .query(`
      SELECT r.id, r.booking_id, r.room_type_id, r.rating, r.comment, r.is_hidden,
             u.full_name AS customer_name, rt.name AS room_type_name
      FROM dbo.reviews r
      JOIN dbo.users u ON u.id = r.customer_id
      LEFT JOIN dbo.room_types rt ON rt.id = r.room_type_id
      WHERE r.id = @reviewId AND r.customer_id = @customerId;
    `);
  return ReviewModel.fromRow(normalizeReview(result.recordset[0]));
}

async function createCustomerReview({ bookingId, customerId, rating, comment }) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const booking = await new sql.Request(transaction)
      .input('bookingId', sql.BigInt, bookingId)
      .input('customerId', sql.BigInt, customerId)
      .query(`
        SELECT b.id, b.status, b.total_amount, b.deposit_amount,
               COUNT(DISTINCT br.room_type_id) AS room_type_count,
               MIN(br.room_type_id) AS room_type_id,
               COALESCE(payment_summary.final_paid_amount, 0) AS final_paid_amount,
               COALESCE(payment_summary.has_pending_payment, 0) AS has_pending_payment
        FROM dbo.bookings b WITH (UPDLOCK, HOLDLOCK)
        LEFT JOIN dbo.booking_rooms br ON br.booking_id = b.id
        OUTER APPLY (
          SELECT SUM(CASE WHEN p.payment_type = 'FINAL' AND p.status = 'SUCCESS' THEN p.amount ELSE 0 END) AS final_paid_amount,
                 MAX(CASE WHEN p.status = 'PENDING' THEN 1 ELSE 0 END) AS has_pending_payment
          FROM dbo.payments p WHERE p.booking_id = b.id
        ) payment_summary
        WHERE b.id = @bookingId AND b.customer_id = @customerId
        GROUP BY b.id, b.status, b.total_amount, b.deposit_amount,
                 payment_summary.final_paid_amount, payment_summary.has_pending_payment;
      `);
    if (!booking.recordset.length) {
      const error = new Error('Booking không tồn tại hoặc không thuộc tài khoản của bạn.');
      error.statusCode = 404;
      throw error;
    }
    const row = booking.recordset[0];
    const amountPaid = Number(row.deposit_amount || 0) + Number(row.final_paid_amount || 0);
    if (!['CHECKED_IN', 'CHECKED_OUT'].includes(String(row.status).toUpperCase())
      || amountPaid < Number(row.total_amount || 0)
      || Number(row.has_pending_payment || 0) > 0) {
      const error = new Error('Chỉ có thể đánh giá sau khi đã check-in và thanh toán đủ booking.');
      error.statusCode = 409;
      throw error;
    }
    if (Number(row.room_type_count) !== 1) {
      const error = new Error('Chỉ có thể đánh giá booking gắn với đúng một loại phòng. Booking nhiều loại phòng chưa có quy tắc gắn review được xác nhận.');
      error.statusCode = 409;
      throw error;
    }
    const inserted = await new sql.Request(transaction)
      .input('bookingId', sql.BigInt, bookingId)
      .input('customerId', sql.BigInt, customerId)
      .input('roomTypeId', sql.Int, Number(row.room_type_id))
      .input('rating', sql.TinyInt, rating)
      .input('comment', sql.NVarChar(sql.MAX), comment)
      .query(`
        INSERT INTO dbo.reviews (booking_id, customer_id, room_type_id, rating, comment, is_hidden)
        OUTPUT INSERTED.id
        VALUES (@bookingId, @customerId, @roomTypeId, @rating, @comment, 0);
      `);
    await transaction.commit();
    return Number(inserted.recordset[0].id);
  } catch (error) {
    try { await transaction.rollback(); } catch { /* preserve the original database error */ }
    if (error.number === 2627 || error.number === 2601) {
      error.statusCode = 409;
      error.message = 'Booking này đã có review.';
    }
    throw error;
  }
}

async function updateCustomerReview({ reviewId, customerId, rating, comment }) {
  const pool = await getPool();
  const result = await pool.request()
    .input('reviewId', sql.BigInt, reviewId)
    .input('customerId', sql.BigInt, customerId)
    .input('rating', sql.TinyInt, rating)
    .input('comment', sql.NVarChar(sql.MAX), comment)
    .query(`
      UPDATE r SET rating = @rating, comment = @comment
      FROM dbo.reviews r
      JOIN dbo.bookings b ON b.id = r.booking_id
      OUTER APPLY (
        SELECT SUM(CASE WHEN p.payment_type = 'FINAL' AND p.status = 'SUCCESS' THEN p.amount ELSE 0 END) AS final_paid_amount,
               MAX(CASE WHEN p.status = 'PENDING' THEN 1 ELSE 0 END) AS has_pending_payment
        FROM dbo.payments p WHERE p.booking_id = b.id
      ) payment_summary
      WHERE r.id = @reviewId AND r.customer_id = @customerId
        AND b.status IN ('CHECKED_IN', 'CHECKED_OUT')
        AND COALESCE(b.deposit_amount, 0) + COALESCE(payment_summary.final_paid_amount, 0) >= COALESCE(b.total_amount, 0)
        AND COALESCE(payment_summary.has_pending_payment, 0) = 0;
      SELECT @@ROWCOUNT AS affected;
    `);
  return Number(result.recordset[0]?.affected ?? 0) > 0;
}

async function deleteReview(reviewId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('reviewId', sql.BigInt, reviewId)
    .query(`
      DELETE FROM dbo.reviews WHERE id = @reviewId;
      SELECT @@ROWCOUNT AS affected;
    `);
  return Number(result.recordset[0]?.affected ?? 0) > 0;
}

async function deleteCustomerReview(reviewId, customerId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('reviewId', sql.BigInt, reviewId)
    .input('customerId', sql.BigInt, customerId)
    .query(`
      DELETE FROM dbo.reviews
      WHERE id = @reviewId AND customer_id = @customerId;
      SELECT @@ROWCOUNT AS affected;
    `);
  return Number(result.recordset[0]?.affected ?? 0) > 0;
}

module.exports = { listDashboardReviews, listCustomerBookings, getCustomerReview, createCustomerReview, updateCustomerReview, deleteReview, deleteCustomerReview };
