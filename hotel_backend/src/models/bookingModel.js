const BaseModel = require('./baseModel');

class BookingModel extends BaseModel {
  static calculateNights(checkInDate, checkOutDate) {
    const start = new Date(checkInDate);
    const end = new Date(checkOutDate);
    const difference = end.getTime() - start.getTime();
    return Math.max(1, Math.ceil(difference / (1000 * 60 * 60 * 24)));
  }

  static generateBookingCode() {
    const timestamp = Date.now().toString().slice(-6);
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    return `BK${timestamp}${randomSuffix}`;
  }

  static get schema() {
    return {"name":"BookingModel","table":"bookings","primaryKey":"id","fields":["id","booking_code","customer_id","status","check_in_date","check_out_date","adults","children","total_amount","deposit_amount","special_request","created_at","updated_at"]};
  }
}

module.exports = BookingModel;
