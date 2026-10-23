const BaseModel = require('./baseModel');

class ServiceModel extends BaseModel {
  static validate(input) {
    if (!input || typeof input.name !== 'string' || !input.name.trim()) {
      throw new Error('Service name is required.');
    }
    if (input.price === undefined || input.price === null || input.price === '') {
      throw new Error('Service price is required.');
    }
    if (!Number.isFinite(Number(input.price))) throw new Error('Service price must be a valid number.');
    if (Number(input.price) < 0) throw new Error('Service price cannot be negative.');
    if (typeof input.unit !== 'string' || !input.unit.trim()) throw new Error('Service unit is required.');
    if (input.description != null && typeof input.description !== 'string') throw new Error('Service description must be text.');
    if (input.is_active != null && typeof input.is_active !== 'boolean') throw new Error('Service status must be active or inactive.');
    if (input.booking_policy != null && !['PREBOOK', 'ON_DEMAND'].includes(input.booking_policy)) {
      throw new Error('Service booking policy must be PREBOOK or ON_DEMAND.');
    }
  }

  static normalizeInput(input, fallbackPolicy = 'ON_DEMAND') {
    this.validate(input);
    return {
      name: input.name.trim(),
      description: input.description ? input.description.trim() : '',
      price: Number(input.price),
      unit: input.unit.trim(),
      is_active: input.is_active !== false,
      booking_policy: input.booking_policy || fallbackPolicy,
    };
  }

  static get schema() {
    return {
      name: 'ServiceModel', table: 'services', primaryKey: 'id',
      fields: ['id', 'name', 'description', 'price', 'unit', 'booking_policy', 'is_active'],
    };
  }
}

module.exports = ServiceModel;
