function toUpdateReviewRequest(body = {}) { return { booking_id: body?.booking_id, rating: body?.rating, comment: body?.comment }; }
module.exports = { toUpdateReviewRequest };
