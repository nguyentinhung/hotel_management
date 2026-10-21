const BaseModel = require('./baseModel');
const AmenityModel = require('./amenityModel');

class RoomTypeModel extends BaseModel {
  static normalizeInput(input = {}, update = false) {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const basePrice = Number(input.base_price);
    const maxAdults = Number(input.max_adults);
    const maxChildren = Number(input.max_children);
    if (!name || name.length > 100) {
      const error = new Error('Tên loại phòng là bắt buộc và tối đa 100 ký tự.');
      error.statusCode = 400;
      throw error;
    }
    if (!Number.isFinite(basePrice) || basePrice < 0
      || !Number.isInteger(maxAdults) || maxAdults < 1 || maxAdults > 255
      || !Number.isInteger(maxChildren) || maxChildren < 0 || maxChildren > 255) {
      const error = new Error(update ? 'Giá và sức chứa không hợp lệ.' : 'Giá hoặc sức chứa không hợp lệ.');
      error.statusCode = 400;
      throw error;
    }
    if (input.description != null && typeof input.description !== 'string') {
      const error = new Error('Mô tả không hợp lệ.');
      error.statusCode = 400;
      throw error;
    }
    const amenityIds = AmenityModel.normalizeIds(input.amenity_ids);
    if (amenityIds == null) {
      const error = new Error('Danh sách tiện nghi không hợp lệ.');
      error.statusCode = 400;
      throw error;
    }
    return {
      data: { name, description: input.description?.trim() || null, basePrice, maxAdults, maxChildren },
      amenityIds,
    };
  }

  static get schema() {
    return {
      name: 'RoomTypeModel', table: 'room_types', primaryKey: 'id',
      fields: ['id', 'name', 'description', 'base_price', 'max_adults', 'max_children'],
    };
  }
}

module.exports = RoomTypeModel;
