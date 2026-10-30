const { sql, getPool } = require('../config/db');

/*
 * Requires dbo.cleaning_task_inspections and dbo.cleaning_task_inspection_items,
 * created manually with hotel_backend/sql/manual_cleaning_task_equipment_inspection.sql.
 * Application startup deliberately does not create or synchronize these tables.
 */

function inspectionError(message, statusCode = 409, reason = 'inspection_conflict') {
  return Object.assign(new Error(message), { statusCode, reason });
}

async function findLockedTask(transaction, taskId) {
  const result = await transaction.request()
    .input('taskId', sql.BigInt, taskId)
    .query(`
      SELECT id, room_id, booking_room_id, assigned_to, task_type, status
      FROM dbo.cleaning_tasks WITH (UPDLOCK, HOLDLOCK)
      WHERE id = @taskId;
    `);
  return result.recordset[0] || null;
}

function assertInspectionTask(task, actorUserId) {
  if (!task) throw inspectionError('Cleaning task not found.', 404, 'task_not_found');
  if (task.task_type !== 'CHECKOUT_CLEANING') {
    throw inspectionError('Room equipment inspections are only available for checkout cleaning tasks.', 409, 'inspection_task_type_invalid');
  }
  if (String(task.assigned_to) !== String(actorUserId)) {
    throw inspectionError('This task is not assigned to the authenticated housekeeper.', 403, 'task_not_assigned_to_actor');
  }
  if (task.status !== 'IN_PROGRESS') {
    throw inspectionError('The checkout cleaning task must be in progress before inspection.', 409, 'inspection_task_not_in_progress');
  }
}

async function listConfiguredEquipment(taskId, actorUserId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('taskId', sql.BigInt, taskId)
    .input('actorUserId', sql.BigInt, actorUserId)
    .query(`
      SELECT ct.id AS task_id, ct.room_id, ct.task_type, ct.status, ct.assigned_to,
        CONVERT(varchar(20), asset.id) AS equipment_asset_id,
        asset.asset_code, item.name AS equipment_name
      FROM dbo.cleaning_tasks AS ct
      LEFT JOIN dbo.room_asset_assignments AS assignment
        ON assignment.room_id = ct.room_id AND assignment.unassigned_at IS NULL
      LEFT JOIN dbo.equipment_assets AS asset ON asset.id = assignment.equipment_asset_id
      LEFT JOIN dbo.equipment_items AS item ON item.id = asset.equipment_item_id
      WHERE ct.id = @taskId AND ct.task_type = 'CHECKOUT_CLEANING'
        AND ct.status = 'IN_PROGRESS' AND ct.assigned_to = @actorUserId
      ORDER BY item.name, asset.asset_code, asset.id;
    `);
  const first = result.recordset[0];
  if (!first) {
    const task = await pool.request()
      .input('taskId', sql.BigInt, taskId)
      .query('SELECT id, room_id, assigned_to, task_type, status FROM dbo.cleaning_tasks WHERE id = @taskId;');
    assertInspectionTask(task.recordset[0] || null, actorUserId);
  }
  return result.recordset.filter((row) => row.equipment_asset_id != null).map((row) => ({
    equipment_asset_id: row.equipment_asset_id,
    asset_code: row.asset_code,
    equipment_name: row.equipment_name,
  }));
}

async function getInspectionReport(taskId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('taskId', sql.BigInt, taskId)
    .query(`
      SELECT report.id AS inspection_id, report.cleaning_task_id, report.room_id,
        room.room_number, booking.booking_code, booking.guest_full_name,
        report.inspected_by_user_id, housekeeper.full_name AS housekeeper_name, report.submitted_at,
        CONVERT(varchar(20), item.id) AS inspection_item_id,
        CONVERT(varchar(20), item.equipment_asset_id) AS equipment_asset_id,
        item.equipment_name, item.asset_code, item.status AS inspection_status, item.notes,
        compensation.decision AS compensation_decision, compensation.amount AS compensation_amount
      FROM dbo.cleaning_task_inspections AS report
      JOIN dbo.rooms AS room ON room.id = report.room_id
      JOIN dbo.users AS housekeeper ON housekeeper.id = report.inspected_by_user_id
      LEFT JOIN dbo.cleaning_tasks AS task ON task.id = report.cleaning_task_id
      LEFT JOIN dbo.booking_rooms AS booking_room
        ON booking_room.id = task.booking_room_id AND booking_room.room_id = task.room_id
      LEFT JOIN dbo.bookings AS booking ON booking.id = booking_room.booking_id
      LEFT JOIN dbo.cleaning_task_inspection_items AS item ON item.inspection_id = report.id
      LEFT JOIN dbo.cleaning_task_equipment_compensations AS compensation
        ON compensation.inspection_item_id = item.id
      WHERE report.cleaning_task_id = @taskId
      ORDER BY item.equipment_name, item.asset_code, item.id;
    `);
  const first = result.recordset[0];
  if (!first) return null;
  return {
    id: String(first.inspection_id),
    cleaning_task_id: String(first.cleaning_task_id),
    room_id: first.room_id,
    room_number: first.room_number,
    booking_code: first.booking_code,
    guest_full_name: first.guest_full_name,
    inspected_by_user_id: String(first.inspected_by_user_id),
    housekeeper_name: first.housekeeper_name,
    submitted_at: first.submitted_at,
    items: result.recordset.filter((row) => row.equipment_asset_id != null).map((row) => ({
      inspection_item_id: String(row.inspection_item_id),
      equipment_asset_id: row.equipment_asset_id,
      equipment_name: row.equipment_name,
      asset_code: row.asset_code,
      status: row.inspection_status,
      notes: row.notes,
      compensation_decision: row.compensation_decision || null,
      compensation_amount: row.compensation_amount == null ? null : Number(row.compensation_amount),
    })),
  };
}

async function submitInspection(taskId, actorUserId, inspections) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const task = await findLockedTask(transaction, taskId);
    assertInspectionTask(task, actorUserId);

    const equipmentResult = await transaction.request()
      .input('roomId', sql.Int, task.room_id)
      .query(`
        SELECT CONVERT(varchar(20), asset.id) AS equipment_asset_id,
          asset.asset_code, item.name AS equipment_name
        FROM dbo.room_asset_assignments AS assignment WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.equipment_assets AS asset WITH (UPDLOCK, HOLDLOCK)
          ON asset.id = assignment.equipment_asset_id
        JOIN dbo.equipment_items AS item WITH (HOLDLOCK) ON item.id = asset.equipment_item_id
        WHERE assignment.room_id = @roomId AND assignment.unassigned_at IS NULL
        ORDER BY item.name, asset.asset_code, asset.id;
      `);
    const configured = equipmentResult.recordset;
    const submittedIds = new Set(inspections.map((inspection) => inspection.equipment_asset_id));
    const configuredIds = new Set(configured.map((item) => String(item.equipment_asset_id)));
    if (submittedIds.size !== inspections.length || submittedIds.size !== configuredIds.size
      || [...configuredIds].some((id) => !submittedIds.has(id))) {
      throw inspectionError('Submit exactly one inspection result for every equipment item currently configured for the room.', 400, 'inspection_items_incomplete');
    }

    const reportResult = await transaction.request()
      .input('taskId', sql.BigInt, taskId)
      .input('roomId', sql.Int, task.room_id)
      .input('housekeeperId', sql.BigInt, actorUserId)
      .query(`
        INSERT INTO dbo.cleaning_task_inspections
          (cleaning_task_id, room_id, inspected_by_user_id, submitted_at)
        OUTPUT CONVERT(varchar(20), INSERTED.id) AS id
        VALUES (@taskId, @roomId, @housekeeperId, SYSUTCDATETIME());
      `);
    const inspectionId = reportResult.recordset[0]?.id;
    if (!inspectionId) throw new Error('Room equipment inspection insert did not return an ID.');

    const byAssetId = new Map(inspections.map((inspection) => [inspection.equipment_asset_id, inspection]));
    for (const equipment of configured) {
      const inspection = byAssetId.get(String(equipment.equipment_asset_id));
      await transaction.request()
        .input('inspectionId', sql.BigInt, inspectionId)
        .input('equipmentAssetId', sql.BigInt, equipment.equipment_asset_id)
        .input('equipmentName', sql.NVarChar(200), equipment.equipment_name)
        .input('assetCode', sql.VarChar(50), equipment.asset_code)
        .input('status', sql.VarChar(10), inspection.status)
        .input('notes', sql.NVarChar(1000), inspection.notes)
        .query(`
          INSERT INTO dbo.cleaning_task_inspection_items
            (inspection_id, equipment_asset_id, equipment_name, asset_code, status, notes)
          VALUES (@inspectionId, @equipmentAssetId, @equipmentName, @assetCode, @status, @notes);
        `);
    }

    await transaction.commit();
    return { inspection_id: String(inspectionId) };
  } catch (error) {
    try { await transaction.rollback(); } catch (rollbackError) {
      console.error('Room equipment inspection rollback failed:', rollbackError);
    }
    if ([error.number, error.originalError?.info?.number, ...(error.precedingErrors || []).map((item) => item.number)]
      .some((number) => number === 2601 || number === 2627)) {
      throw inspectionError('An equipment inspection has already been submitted for this cleaning task.', 409, 'inspection_already_submitted');
    }
    if ([error.number, error.originalError?.info?.number, ...(error.precedingErrors || []).map((item) => item.number)]
      .some((number) => number === 547)) {
      throw inspectionError('The room, task, housekeeper, or equipment reference changed before the inspection was saved.', 409, 'inspection_reference_conflict');
    }
    throw error;
  }
}

module.exports = { listConfiguredEquipment, getInspectionReport, submitInspection };
