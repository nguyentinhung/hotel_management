const equipmentAssetDao = require('../dao/equipmentAssetDao');
const equipmentItemDao = require('../dao/equipmentItemDao');

const ASSET_STATUSES = ['AVAILABLE', 'MAINTENANCE', 'RETIRED'];

function normalizeOptionalText(value, label, maxLength) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw Object.assign(new Error(`${label} must be text.`), { statusCode: 400 });
  const normalized = value.trim();
  if (normalized.length > maxLength) throw Object.assign(new Error(`${label} must not exceed ${maxLength} characters.`), { statusCode: 400 });
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

function normalizeEquipmentAssetInput(input) {
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
  const purchaseDate = input.purchase_date == null || input.purchase_date === '' ? null : normalizeDate(input.purchase_date);
  return { asset_code: assetCode, serial_number: serialNumber, status, purchase_date: purchaseDate, notes };
}

const DELETE_CONFLICT_MESSAGES = {
  current_assignment: 'Thiết bị vẫn đang được gán với phòng nên không thể xóa.',
  historical_assignment: 'Thiết bị có lịch sử gán phòng nên không thể xóa. Vui lòng chuyển trạng thái sang Retired để giữ hồ sơ.',
  inspection_item: 'Thiết bị có hồ sơ kiểm tra phòng nên không thể xóa. Vui lòng chuyển trạng thái sang Retired để giữ hồ sơ.',
  problem_report: 'Thiết bị có trong báo cáo sự cố nên không thể xóa. Vui lòng chuyển trạng thái sang Retired để giữ hồ sơ.',
  assignment_reference: 'Thiết bị có dữ liệu gán phòng cần bảo toàn nên không thể xóa. Vui lòng chuyển trạng thái sang Retired để giữ hồ sơ.',
  protected_reference: 'Thiết bị đang được dữ liệu khác tham chiếu nên không thể xóa.',
};

function deleteConflict(referenceType) {
  return Object.assign(new Error(DELETE_CONFLICT_MESSAGES[referenceType] || DELETE_CONFLICT_MESSAGES.protected_reference), {
    statusCode: 409,
    referenceType,
  });
}

function isForeignKeyViolation(error) {
  return [error.number, error.originalError?.info?.number, ...(error.precedingErrors || []).map((item) => item.number)]
    .some((number) => number === 547);
}

function foreignKeyReferenceType(error) {
  const details = [
    error.message,
    error.originalError?.info?.message,
    error.originalError?.message,
    ...(Array.isArray(error.precedingErrors) ? error.precedingErrors.map((item) => item.message) : []),
  ].filter(Boolean).join(' ');
  if (/FK_room_inspection_items_asset/i.test(details)) return 'inspection_item';
  if (/FK_rpr_equipment_asset/i.test(details)) return 'problem_report';
  if (/FK_rea_asset/i.test(details)) return 'assignment_reference';
  return 'protected_reference';
}

function parseIntId(value, label, maximum = 2147483647) {
  const raw = String(value ?? '');
  if (!/^\d+$/.test(raw)) throw Object.assign(new Error(`${label} must be a positive integer.`), { statusCode: 400 });
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1 || id > maximum) {
    throw Object.assign(new Error(`${label} must be a positive integer.`), { statusCode: 400 });
  }
  return id;
}

function parseBigIntId(value, label) {
  const raw = String(value ?? '');
  if (!/^\d+$/.test(raw)) throw Object.assign(new Error(`${label} must be a positive integer.`), { statusCode: 400 });
  let id;
  try { id = BigInt(raw); } catch {
    throw Object.assign(new Error(`${label} must be a positive integer.`), { statusCode: 400 });
  }
  if (id < 1n || id > 9223372036854775807n) {
    throw Object.assign(new Error(`${label} must be a positive SQL BIGINT.`), { statusCode: 400 });
  }
  return id.toString();
}

async function requireEquipmentItem(equipmentItemId) {
  const item = await equipmentItemDao.findById(equipmentItemId);
  if (!item) return null;
  return item;
}

async function getEquipmentAssets(equipmentItemId) {
  const parsedItemId = parseIntId(equipmentItemId, 'Equipment type ID');
  if (!await requireEquipmentItem(parsedItemId)) return null;
  return equipmentAssetDao.findAllByEquipmentItemId(parsedItemId);
}

async function getEquipmentAsset(equipmentItemId, assetId) {
  const parsedItemId = parseIntId(equipmentItemId, 'Equipment type ID');
  const parsedAssetId = parseBigIntId(assetId, 'Equipment asset ID');
  if (!await requireEquipmentItem(parsedItemId)) return null;
  return equipmentAssetDao.findById(parsedItemId, parsedAssetId);
}

async function createEquipmentAsset(equipmentItemId, input) {
  const parsedItemId = parseIntId(equipmentItemId, 'Equipment type ID');
  if (!await requireEquipmentItem(parsedItemId)) return null;
  return equipmentAssetDao.create(parsedItemId, normalizeEquipmentAssetInput(input));
}

async function updateEquipmentAsset(equipmentItemId, assetId, input) {
  const parsedItemId = parseIntId(equipmentItemId, 'Equipment type ID');
  const parsedAssetId = parseBigIntId(assetId, 'Equipment asset ID');
  if (!await requireEquipmentItem(parsedItemId)) return null;
  return equipmentAssetDao.update(parsedItemId, parsedAssetId, normalizeEquipmentAssetInput(input));
}

async function deleteEquipmentAsset(equipmentItemId, assetId) {
  const parsedItemId = parseIntId(equipmentItemId, 'Equipment type ID');
  const parsedAssetId = parseBigIntId(assetId, 'Equipment asset ID');
  if (!await requireEquipmentItem(parsedItemId)) return null;
  try {
    return await equipmentAssetDao.deleteById(parsedItemId, parsedAssetId);
  } catch (error) {
    if (error.statusCode === 409 && error.referenceType) throw deleteConflict(error.referenceType);
    if (!isForeignKeyViolation(error)) throw error;

    const referenceType = foreignKeyReferenceType(error);
    if (referenceType === 'assignment_reference') {
      try {
        const state = await equipmentAssetDao.getDeleteReferenceState(parsedItemId, parsedAssetId);
        if (state?.currentAssignmentCount > 0) throw deleteConflict('current_assignment');
        if (state?.historicalAssignmentCount > 0) throw deleteConflict('historical_assignment');
      } catch (classificationError) {
        if (classificationError.statusCode === 409) throw classificationError;
        // The original FK violation remains authoritative if a follow-up read cannot classify it.
      }
    }
    throw deleteConflict(referenceType);
  }
}

module.exports = { getEquipmentAssets, getEquipmentAsset, createEquipmentAsset, updateEquipmentAsset, deleteEquipmentAsset };
