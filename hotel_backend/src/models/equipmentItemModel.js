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
    if (Object.prototype.hasOwnProperty.call(input, 'description')) {
      if (input.description !== null && (typeof input.description !== 'string' || input.description.length > 500)) {
        throw Object.assign(new Error('Equipment description must be text and must not exceed 500 characters.'), { statusCode: 400 });
      }
      const description = typeof input.description === 'string' ? input.description.trim() : '';
      equipmentItem.description = description || null;
    }
    return equipmentItem;
  }

  static get schema() {
    return {
      name: 'EquipmentItemModel', table: 'equipment_items', primaryKey: 'id',
      fields: ['id', 'name', 'description', 'is_active'],
    };
  }
}

module.exports = EquipmentItemModel;
