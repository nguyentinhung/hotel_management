const BaseModel = require('./baseModel');

class AmenityModel extends BaseModel {
  static normalizeIds(value) {
    if (value == null) return [];
    if (!Array.isArray(value)) return null;
    const ids = value.map(Number);
    if (ids.some((id) => !Number.isInteger(id) || id < 1)) return null;
    return [...new Set(ids)];
  }

  static get schema() {
    return { name: 'AmenityModel', table: 'amenities', primaryKey: 'id', fields: ['id', 'name'] };
  }
}

module.exports = AmenityModel;
