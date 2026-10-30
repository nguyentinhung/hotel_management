const { getPool, sql } = require('../config/db');

async function listActiveByRoomId(roomId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('roomId', sql.Int, roomId)
    .query(`
      SELECT CONVERT(varchar(20), assignment.id) AS assignment_id, assignment.room_id,
        CONVERT(varchar(20), assignment.equipment_asset_id) AS equipment_asset_id, assignment.assigned_at,
        asset.equipment_item_id, asset.asset_code, asset.serial_number, asset.status,
        item.name AS equipment_item_name
      FROM dbo.room_asset_assignments AS assignment
      INNER JOIN dbo.equipment_assets AS asset ON asset.id = assignment.equipment_asset_id
      INNER JOIN dbo.equipment_items AS item ON item.id = asset.equipment_item_id
      WHERE assignment.room_id = @roomId AND assignment.unassigned_at IS NULL
      ORDER BY assignment.assigned_at DESC, assignment.id DESC;
    `);
  return result.recordset;
}

async function listAssignableAssets(equipmentItemId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('equipmentItemId', sql.Int, equipmentItemId)
    .query(`
    SELECT CONVERT(varchar(20), asset.id) AS equipment_asset_id, asset.equipment_item_id,
      asset.asset_code, asset.serial_number, asset.status,
      item.name AS equipment_item_name
    FROM dbo.equipment_assets AS asset
    INNER JOIN dbo.equipment_items AS item ON item.id = asset.equipment_item_id
    WHERE item.is_active = 1
      AND item.id = @equipmentItemId
      AND asset.status = 'AVAILABLE'
      AND NOT EXISTS (
        SELECT 1 FROM dbo.room_asset_assignments AS assignment
        WHERE assignment.equipment_asset_id = asset.id
          AND assignment.unassigned_at IS NULL
      )
    ORDER BY item.name, asset.asset_code;
  `);
  return result.recordset;
}

function isUniqueConflict(error) {
  return [error.number, error.originalError?.info?.number, ...(error.precedingErrors || []).map((item) => item.number)]
    .some((number) => number === 2601 || number === 2627);
}

function isForeignKeyConflict(error) {
  return [error.number, error.originalError?.info?.number, ...(error.precedingErrors || []).map((item) => item.number)]
    .some((number) => number === 547);
}

async function assignToRoom(roomId, equipmentAssetId, expectedEquipmentItemId) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    const room = await new sql.Request(transaction)
      .input('roomId', sql.Int, roomId)
      .query('SELECT id FROM dbo.rooms WITH (UPDLOCK, HOLDLOCK) WHERE id = @roomId;');
    if (!room.recordset.length) {
      await transaction.rollback();
      return { reason: 'room_not_found' };
    }

    const asset = await new sql.Request(transaction)
      .input('equipmentAssetId', sql.BigInt, equipmentAssetId)
      .input('equipmentItemId', sql.Int, expectedEquipmentItemId)
      .query(`
        SELECT asset.id, asset.equipment_item_id, asset.status, item.is_active,
          CASE WHEN asset.equipment_item_id = @equipmentItemId THEN 0 ELSE 1 END AS equipment_item_mismatch
        FROM dbo.equipment_assets AS asset WITH (UPDLOCK, HOLDLOCK)
        INNER JOIN dbo.equipment_items AS item WITH (UPDLOCK, HOLDLOCK)
          ON item.id = asset.equipment_item_id
        WHERE asset.id = @equipmentAssetId;
      `);
    if (!asset.recordset.length) {
      await transaction.rollback();
      return { reason: 'asset_not_found' };
    }
    if (asset.recordset[0].equipment_item_mismatch) {
      await transaction.rollback();
      return { reason: 'asset_type_mismatch' };
    }
    if (!asset.recordset[0].is_active) {
      await transaction.rollback();
      return { reason: 'equipment_type_inactive' };
    }
    const currentStatus = String(asset.recordset[0].status || '').toUpperCase();
    if (currentStatus !== 'AVAILABLE') {
      await transaction.rollback();
      return { reason: 'asset_not_available', status: currentStatus };
    }

    const currentAssignment = await new sql.Request(transaction)
      .input('equipmentAssetId', sql.BigInt, equipmentAssetId)
      .query(`
        SELECT TOP (1) CONVERT(varchar(20), id) AS id, room_id
        FROM dbo.room_asset_assignments WITH (UPDLOCK, HOLDLOCK)
        WHERE equipment_asset_id = @equipmentAssetId AND unassigned_at IS NULL;
      `);
    if (currentAssignment.recordset.length) {
      await transaction.rollback();
      return { reason: Number(currentAssignment.recordset[0].room_id) === roomId
        ? 'already_assigned_to_room' : 'assigned_to_another_room' };
    }

    const result = await new sql.Request(transaction)
      .input('roomId', sql.Int, roomId)
      .input('equipmentAssetId', sql.BigInt, equipmentAssetId)
      .query(`
        INSERT INTO dbo.room_asset_assignments (room_id, equipment_asset_id, assigned_at)
        OUTPUT CONVERT(varchar(20), INSERTED.id) AS assignment_id, INSERTED.room_id,
          CONVERT(varchar(20), INSERTED.equipment_asset_id) AS equipment_asset_id, INSERTED.assigned_at
        VALUES (@roomId, @equipmentAssetId, SYSUTCDATETIME());
      `);
    await transaction.commit();
    return { assignment: result.recordset[0] };
  } catch (error) {
    try { await transaction.rollback(); } catch { /* Preserve the original SQL error. */ }
    if (isUniqueConflict(error)) return { reason: 'assignment_conflict' };
    if (isForeignKeyConflict(error)) return { reason: 'assignment_reference_conflict' };
    throw error;
  }
}

async function unassignFromRoom(roomId, equipmentAssetId) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    const room = await new sql.Request(transaction)
      .input('roomId', sql.Int, roomId)
      .query('SELECT id FROM dbo.rooms WITH (UPDLOCK, HOLDLOCK) WHERE id = @roomId;');
    if (!room.recordset.length) {
      await transaction.rollback();
      return { reason: 'room_not_found' };
    }

    const asset = await new sql.Request(transaction)
      .input('equipmentAssetId', sql.BigInt, equipmentAssetId)
      .query(`
        SELECT id
        FROM dbo.equipment_assets WITH (UPDLOCK, HOLDLOCK)
        WHERE id = @equipmentAssetId;
      `);
    if (!asset.recordset.length) {
      await transaction.rollback();
      return { reason: 'asset_not_found' };
    }

    const assignment = await new sql.Request(transaction)
      .input('equipmentAssetId', sql.BigInt, equipmentAssetId)
      .query(`
        SELECT TOP (1) CONVERT(varchar(20), id) AS id, room_id
        FROM dbo.room_asset_assignments WITH (UPDLOCK, HOLDLOCK)
        WHERE equipment_asset_id = @equipmentAssetId AND unassigned_at IS NULL;
      `);
    if (!assignment.recordset.length) {
      await transaction.rollback();
      return { reason: 'assignment_not_found' };
    }
    if (Number(assignment.recordset[0].room_id) !== roomId) {
      await transaction.rollback();
      return { reason: 'assigned_to_another_room' };
    }
    const endedAssignment = await new sql.Request(transaction)
      .input('assignmentId', sql.BigInt, assignment.recordset[0].id)
      .input('roomId', sql.Int, roomId)
      .input('equipmentAssetId', sql.BigInt, equipmentAssetId)
      .query(`
        UPDATE dbo.room_asset_assignments
        SET unassigned_at = SYSUTCDATETIME()
        OUTPUT CONVERT(varchar(20), INSERTED.id) AS assignment_id, INSERTED.room_id,
          CONVERT(varchar(20), INSERTED.equipment_asset_id) AS equipment_asset_id, INSERTED.unassigned_at
        WHERE id = @assignmentId AND room_id = @roomId
          AND equipment_asset_id = @equipmentAssetId AND unassigned_at IS NULL;
      `);
    if (!endedAssignment.recordset.length) {
      await transaction.rollback();
      return { reason: 'assignment_conflict' };
    }

    await transaction.commit();
    return { assignment: endedAssignment.recordset[0], equipment_asset_id: String(equipmentAssetId) };
  } catch (error) {
    try { await transaction.rollback(); } catch { /* Preserve the original SQL error. */ }
    if (isForeignKeyConflict(error)) return { reason: 'assignment_reference_conflict' };
    throw error;
  }
}

module.exports = { listActiveByRoomId, listAssignableAssets, assignToRoom, unassignFromRoom };
