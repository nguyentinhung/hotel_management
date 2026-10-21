const BaseModel = require('./baseModel');

class ReviewModel extends BaseModel {
  static validatePayload(input) {
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

  static get schema() {
    return {
      name: 'ReviewModel', table: 'reviews', primaryKey: 'id',
      fields: ['id', 'booking_id', 'customer_id', 'room_type_id', 'rating', 'comment', 'is_hidden'],
    };
  }
}

module.exports = ReviewModel;
