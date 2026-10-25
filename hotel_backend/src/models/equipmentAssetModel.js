const BaseModel = require('./baseModel');

const ASSET_STATUSES = ['AVAILABLE', 'MAINTENANCE', 'RETIRED'];

class EquipmentAssetModel extends BaseModel {
  static normalizeInput(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw Object.assign(new Error('Equipment asset data is required.'), { statusCode: 400 });
    }

    const assetCode = typeof input.asset_code === 'string' ? input.asset_code.trim() : '';
    if (!assetCode || assetCode.length > 50) {
      throw Object.assign(new Error('Asset code is required and must not exceed 50 characters.'), { statusCode: 400 });
    }

    const status = typeof input.status === 'string' ? input.status.trim().toUpperCase() : '';
    if (!ASSET_STATUSES.includes(status)) {
      throw Object.assign(new Error(`Status must be one of: ${ASSET_STATUSES.join(', ')}.`), { statusCode: 400 });
    }

    const serialNumber = normalizeOptionalText(input.serial_number, 'Serial number', 100);
    const notes = normalizeOptionalText(input.notes, 'Notes', 500);
    const purchaseDate = input.purchase_date == null || input.purchase_date === ''
      ? null
      : normalizeDate(input.purchase_date);

    return { asset_code: assetCode, serial_number: serialNumber, status, purchase_date: purchaseDate, notes };
  }

  static get schema() {
    return {
      name: 'EquipmentAssetModel', table: 'equipment_assets', primaryKey: 'id',
      fields: ['id', 'equipment_item_id', 'asset_code', 'serial_number', 'status', 'purchase_date', 'notes', 'current_room_name'],
    };
  }
}

function normalizeOptionalText(value, label, maxLength) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') {
    throw Object.assign(new Error(`${label} must be text.`), { statusCode: 400 });
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw Object.assign(new Error(`${label} must not exceed ${maxLength} characters.`), { statusCode: 400 });
  }
  return normalized || null;
}

function normalizeDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw Object.assign(new Error('Purchase date must be a valid YYYY-MM-DD date.'), { statusCode: 400 });
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw Object.assign(new Error('Purchase date must be a valid YYYY-MM-DD date.'), { statusCode: 400 });
  }
  return value;
}

module.exports = EquipmentAssetModel;
