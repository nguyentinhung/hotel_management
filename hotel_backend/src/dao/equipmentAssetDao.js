const { getPool, sql } = require('../config/db');
const EquipmentAssetModel = require('../models/equipmentAssetModel');

const ASSET_SELECT = `
  SELECT CONVERT(varchar(20), asset.id) AS id, asset.equipment_item_id, asset.asset_code, asset.serial_number,
         asset.status, asset.purchase_date, asset.notes, room.room_number AS current_room_name
  FROM dbo.equipment_assets AS asset
  LEFT JOIN dbo.room_asset_assignments AS assignment
    ON assignment.equipment_asset_id = asset.id AND assignment.unassigned_at IS NULL
  LEFT JOIN dbo.rooms AS room ON room.id = assignment.room_id
`;

async function findAllByEquipmentItemId(equipmentItemId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('equipmentItemId', sql.Int, equipmentItemId)
    .query(`${ASSET_SELECT} WHERE asset.equipment_item_id = @equipmentItemId ORDER BY asset.id;`);
  return EquipmentAssetModel.fromRows(result.recordset);
}

async function findById(equipmentItemId, assetId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('equipmentItemId', sql.Int, equipmentItemId)
    .input('assetId', sql.BigInt, assetId)
    .query(`${ASSET_SELECT} WHERE asset.equipment_item_id = @equipmentItemId AND asset.id = @assetId;`);
  return EquipmentAssetModel.fromRow(result.recordset[0]);
}

async function create(equipmentItemId, asset) {
  const pool = await getPool();
  const result = await pool.request()
    .input('equipmentItemId', sql.Int, equipmentItemId)
    .input('assetCode', sql.VarChar(50), asset.asset_code)
    .input('serialNumber', sql.VarChar(100), asset.serial_number)
    .input('status', sql.VarChar(20), asset.status)
    .input('purchaseDate', sql.Date, asset.purchase_date)
    .input('notes', sql.NVarChar(500), asset.notes)
    .query(`
      INSERT INTO dbo.equipment_assets (equipment_item_id, asset_code, serial_number, status, purchase_date, notes)
      OUTPUT CONVERT(varchar(20), INSERTED.id) AS id, INSERTED.equipment_item_id, INSERTED.asset_code, INSERTED.serial_number,
             INSERTED.status, INSERTED.purchase_date, INSERTED.notes, CAST(NULL AS varchar(10)) AS current_room_name
      SELECT item.id, @assetCode, @serialNumber, @status, @purchaseDate, @notes
      FROM dbo.equipment_items AS item WHERE item.id = @equipmentItemId;
    `);
  return EquipmentAssetModel.fromRow(result.recordset[0]);
}

async function update(equipmentItemId, assetId, asset) {
  const pool = await getPool();
  const result = await pool.request()
    .input('equipmentItemId', sql.Int, equipmentItemId)
    .input('assetId', sql.BigInt, assetId)
    .input('assetCode', sql.VarChar(50), asset.asset_code)
    .input('serialNumber', sql.VarChar(100), asset.serial_number)
    .input('status', sql.VarChar(20), asset.status)
    .input('purchaseDate', sql.Date, asset.purchase_date)
    .input('notes', sql.NVarChar(500), asset.notes)
    .query(`
      UPDATE dbo.equipment_assets
      SET asset_code = @assetCode, serial_number = @serialNumber, status = @status,
          purchase_date = @purchaseDate, notes = @notes, updated_at = SYSDATETIME()
      OUTPUT CONVERT(varchar(20), INSERTED.id) AS id, INSERTED.equipment_item_id, INSERTED.asset_code, INSERTED.serial_number,
             INSERTED.status, INSERTED.purchase_date, INSERTED.notes, CAST(NULL AS varchar(10)) AS current_room_name
      WHERE equipment_item_id = @equipmentItemId AND id = @assetId;
    `);
  return EquipmentAssetModel.fromRow(result.recordset[0]);
}

async function getDeleteReferenceState(equipmentItemId, assetId) {
  const pool = await getPool();
  const schemaResult = await pool.request().query(`
    SELECT CASE
      WHEN OBJECT_ID(N'dbo.room_inspection_items', N'U') IS NOT NULL
       AND COL_LENGTH(N'dbo.room_inspection_items', N'equipment_asset_id') IS NOT NULL
      THEN 1 ELSE 0 END AS has_asset_inspection_reference,
      CASE WHEN COL_LENGTH(N'dbo.room_problem_reports', N'equipment_asset_id') IS NULL
        THEN 0 ELSE 1 END AS has_asset_problem_report_reference;
  `);
  if (!schemaResult.recordset[0]?.has_asset_inspection_reference) {
    throw Object.assign(
      new Error('Asset deletion requires the verified room inspection asset-reference schema.'),
      { statusCode: 503, referenceType: 'inspection_schema_unavailable' },
    );
  }
  const problemReportCount = schemaResult.recordset[0].has_asset_problem_report_reference
    ? `(SELECT COUNT_BIG(*) FROM dbo.room_problem_reports AS report
         WHERE report.equipment_asset_id = asset.id)`
    : 'CONVERT(bigint, 0)';
  const result = await pool.request()
    .input('equipmentItemId', sql.Int, equipmentItemId)
    .input('assetId', sql.BigInt, assetId)
    .query(`
      SELECT CONVERT(varchar(20), asset.id) AS id,
        (SELECT COUNT_BIG(*) FROM dbo.room_asset_assignments AS assignment
         WHERE assignment.equipment_asset_id = asset.id AND assignment.unassigned_at IS NULL) AS current_assignment_count,
        (SELECT COUNT_BIG(*) FROM dbo.room_asset_assignments AS assignment
         WHERE assignment.equipment_asset_id = asset.id AND assignment.unassigned_at IS NOT NULL) AS historical_assignment_count,
        (SELECT COUNT_BIG(*) FROM dbo.room_inspection_items AS inspection
         WHERE inspection.equipment_asset_id = asset.id) AS inspection_item_count,
        ${problemReportCount} AS problem_report_count
      FROM dbo.equipment_assets AS asset
      WHERE asset.equipment_item_id = @equipmentItemId AND asset.id = @assetId;
    `);
  const row = result.recordset[0];
  if (!row) return null;
  return {
    id: row.id,
    currentAssignmentCount: Number(row.current_assignment_count || 0),
    historicalAssignmentCount: Number(row.historical_assignment_count || 0),
    inspectionItemCount: Number(row.inspection_item_count || 0),
    problemReportCount: Number(row.problem_report_count || 0),
  };
}

async function deleteById(equipmentItemId, assetId) {
  const state = await getDeleteReferenceState(equipmentItemId, assetId);
  if (!state) return null;

  const referenceType = state.currentAssignmentCount > 0 ? 'current_assignment'
    : state.historicalAssignmentCount > 0 ? 'historical_assignment'
      : state.inspectionItemCount > 0 ? 'inspection_item'
        : state.problemReportCount > 0 ? 'problem_report' : null;
  if (referenceType) {
    throw Object.assign(new Error('Equipment asset has a protected reference.'), { statusCode: 409, referenceType });
  }

  const pool = await getPool();
  const result = await pool.request()
    .input('equipmentItemId', sql.Int, equipmentItemId)
    .input('assetId', sql.BigInt, assetId)
    .query(`
      DELETE FROM dbo.equipment_assets
      OUTPUT CONVERT(varchar(20), DELETED.id) AS id
      WHERE equipment_item_id = @equipmentItemId AND id = @assetId;
    `);
  return result.recordset[0]?.id ?? null;
}

module.exports = { findAllByEquipmentItemId, findById, create, update, getDeleteReferenceState, deleteById };
