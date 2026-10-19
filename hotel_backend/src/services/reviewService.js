const reviewDao = require('../dao/reviewDao');

function parseId(value, label) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    const error = new Error(`${label} không hợp lệ.`);
    error.statusCode = 400;
    throw error;
  }
  return id;
}

function validatePayload(input) {
  const rating = Number(input?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    const error = new Error('Điểm đánh giá phải là số nguyên từ 1 đến 5.');
    error.statusCode = 400;
    throw error;
  }
  if (input?.comment != null && typeof input.comment !== 'string') {
    const error = new Error('Nội dung đánh giá không hợp lệ.');
    error.statusCode = 400;
    throw error;
  }
  return { rating, comment: input?.comment?.trim() || null };
}

async function dashboardList(roleCode) {
  return reviewDao.listDashboardReviews(roleCode === 'ADMIN');
}

async function customerBookings(customerId) {
  return reviewDao.listCustomerBookings(parseId(customerId, 'Tài khoản'));
}

async function getMine(reviewId, customerId) {
  const review = await reviewDao.getCustomerReview(parseId(reviewId, 'Review'), parseId(customerId, 'Tài khoản'));
  if (!review) {
    const error = new Error('Không tìm thấy review thuộc tài khoản của bạn.');
    error.statusCode = 404;
    throw error;
  }
  return review;
}

async function create(input, customerId) {
  const bookingId = parseId(input?.booking_id, 'Booking');
  const { rating, comment } = validatePayload(input);
  const id = await reviewDao.createCustomerReview({ bookingId, customerId: parseId(customerId, 'Tài khoản'), rating, comment });
  return getMine(id, customerId);
}

async function update(reviewId, input, customerId) {
  const id = parseId(reviewId, 'Review');
  const { rating, comment } = validatePayload(input);
  const updated = await reviewDao.updateCustomerReview({ reviewId: id, customerId: parseId(customerId, 'Tài khoản'), rating, comment });
  if (!updated) {
    const error = new Error('Không tìm thấy review thuộc tài khoản của bạn.');
    error.statusCode = 404;
    throw error;
  }
  return getMine(id, customerId);
}

async function remove(reviewId) {
  const id = parseId(reviewId, 'Review');
  const deleted = await reviewDao.deleteReview(id);
  if (!deleted) {
    const error = new Error('Không tìm thấy review cần xóa.');
    error.statusCode = 404;
    throw error;
  }
  return { message: 'Đã xóa review.' };
}

async function removeMine(reviewId, customerId) {
  const id = parseId(reviewId, 'Review');
  const ownerId = parseId(customerId, 'Tài khoản');
  const deleted = await reviewDao.deleteCustomerReview(id, ownerId);
  if (!deleted) {
    const error = new Error('Không tìm thấy review thuộc tài khoản của bạn.');
    error.statusCode = 404;
    throw error;
  }
  return { message: 'Đã xóa review của bạn.' };
}

module.exports = { dashboardList, customerBookings, getMine, create, update, remove, removeMine };
