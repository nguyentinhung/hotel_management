const BaseModel = require('./baseModel');

class BookingServiceModel extends BaseModel {
  static get schema() {
    return {"name":"BookingServiceModel","table":"booking_services","primaryKey":"id","fields":["id","booking_id","service_id","quantity","unit_price","total_price","created_at"]};
  }
}

module.exports = BookingServiceModel;
