const BaseModel = require('./baseModel');

class EquipmentItemModel extends BaseModel {
  static normalizeInput(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw Object.assign(new Error('Equipment name is required and must not exceed 100 characters.'), { statusCode: 400 });
    }

    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > 100) {
      throw Object.assign(new Error('Equipment name is required and must not exceed 100 characters.'), { statusCode: 400 });
    }
    if (typeof input.is_active !== 'boolean') {
      throw Object.assign(new Error('Active status is required.'), { statusCode: 400 });
    }

    const equipmentItem = { name, is_active: input.is_active };
    if (Object.hasOwn(input, 'description')) {
      const description = input.description;
      if (description != null && typeof description !== 'string') {
        throw Object.assign(new Error('Equipment description must be text and must not exceed 500 characters.'), { statusCode: 400 });
      }
      if (typeof description === 'string' && description.length > 500) {
        throw Object.assign(new Error('Equipment description must be text and must not exceed 500 characters.'), { statusCode: 400 });
      }
      equipmentItem.description = typeof description === 'string' ? description.trim() || null : null;
    }

    return equipmentItem;
  }

  static normalizeRoomIds(input) {
    if (!Array.isArray(input) || input.length > 500) {
      throw Object.assign(new Error('Room IDs must be an array containing no more than 500 rooms.'), { statusCode: 400 });
    }
    const roomIds = input.map((value) => Number(value));
    if (roomIds.some((id) => !Number.isSafeInteger(id) || id < 1 || id > 2147483647)) {
      throw Object.assign(new Error('Every room ID must be a positive integer.'), { statusCode: 400 });
    }
    return [...new Set(roomIds)];
  }

  static get schema() {
    return {
      name: 'EquipmentItemModel', table: 'equipment_items', primaryKey: 'id',
      fields: ['id', 'name', 'description', 'is_active'],
    };
  }
}

module.exports = EquipmentItemModel;
