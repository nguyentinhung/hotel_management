const { sql, getPool } = require('../config/db');
const { normalizeReview } = require('../models/Review');

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
  return result.recordset.map(normalizeReview);
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
             r.id AS review_id, r.rating AS review_rating, r.comment AS review_comment
      FROM dbo.bookings b
      LEFT JOIN dbo.booking_rooms br ON br.booking_id = b.id
      LEFT JOIN dbo.room_types rt ON rt.id = br.room_type_id
      LEFT JOIN dbo.reviews r ON r.booking_id = b.id AND r.customer_id = b.customer_id
      WHERE b.customer_id = @customerId
      GROUP BY b.id, b.booking_code, b.status, b.check_in_date, b.check_out_date,
               r.id, r.rating, r.comment
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
  return normalizeReview(result.recordset[0]);
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
        SELECT b.id, COUNT(DISTINCT br.room_type_id) AS room_type_count,
               MIN(br.room_type_id) AS room_type_id
        FROM dbo.bookings b WITH (UPDLOCK, HOLDLOCK)
        LEFT JOIN dbo.booking_rooms br ON br.booking_id = b.id
        WHERE b.id = @bookingId AND b.customer_id = @customerId
        GROUP BY b.id;
      `);
    if (!booking.recordset.length) {
      const error = new Error('Booking không tồn tại hoặc không thuộc tài khoản của bạn.');
      error.statusCode = 404;
      throw error;
    }
    const row = booking.recordset[0];
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
      UPDATE dbo.reviews SET rating = @rating, comment = @comment
      WHERE id = @reviewId AND customer_id = @customerId;
      SELECT @@ROWCOUNT AS affected;
    `);
  return Number(result.recordset[0]?.affected ?? 0) > 0;
}

module.exports = { listDashboardReviews, listCustomerBookings, getCustomerReview, createCustomerReview, updateCustomerReview };
