const BaseModel = require('./baseModel');

class BookingServiceModel extends BaseModel {
  static normalizeUsageInput(input = {}) {
    const bookingRoomId = Number(input.bookingRoomId);
    const serviceId = Number(input.serviceId);
    const quantity = Number(input.quantity);
    if (!Number.isSafeInteger(bookingRoomId) || bookingRoomId < 1
      || !Number.isInteger(serviceId) || serviceId < 1
      || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      throw Object.assign(new Error('Invalid booking service selection.'), { code: 'INVALID_SELECTION' });
    }
    return { bookingRoomId, serviceId, quantity };
  }

  static get schema() {
    return {"name":"BookingServiceModel","table":"booking_services","primaryKey":"id","fields":["id","booking_id","service_id","quantity","unit_price","total_price","created_at"]};
  }
}

module.exports = BookingServiceModel;
