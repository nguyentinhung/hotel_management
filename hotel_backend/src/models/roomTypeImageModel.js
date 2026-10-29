const BaseModel = require('./baseModel');

class RoomTypeImageModel extends BaseModel {
  static get schema() {
    return {
      name: 'RoomTypeImageModel',
      table: 'room_type_images',
      primaryKey: 'id',
      fields: ['id', 'room_type_id', 'image_url', 'image_data', 'mime_type', 'is_primary'],
    };
  }
}

module.exports = RoomTypeImageModel;
