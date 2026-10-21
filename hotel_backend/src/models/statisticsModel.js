const BaseModel = require('./baseModel');

class StatisticsModel extends BaseModel {
  static get schema() {
    return {"name":"StatisticsModel","table":null,"primaryKey":null,"fields":["total_bookings","total_revenue","occupancy_rate","total_customers","room_type_id","room_type_name","booking_count","revenue"]};
  }
}

module.exports = StatisticsModel;
