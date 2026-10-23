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

    return { name, is_active: input.is_active };
  }

  static get schema() {
    return {
      name: 'EquipmentItemModel', table: 'equipment_items', primaryKey: 'id',
      fields: ['id', 'name', 'is_active'],
    };
  }
}

module.exports = EquipmentItemModel;
