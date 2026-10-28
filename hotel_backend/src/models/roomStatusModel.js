const BaseModel = require('./baseModel');

class RoomStatusModel extends BaseModel {
  static get schema() {
    return {
      name: 'RoomStatusModel', table: 'rooms', primaryKey: 'id',
      fields: ['id', 'room_id', 'room_number', 'floor', 'status', 'room_type_id', 'room_type_name', 'has_open_maintenance_report'],
    };
  }
}

module.exports = RoomStatusModel;
