const { sql, getPool } = require('../config/db');

function compensationError(code, statusCode, message) {
  return Object.assign(new Error(message), { code, statusCode });
}

async function saveInspectionItemCompensation({ taskId, inspectionItemId, decision, amount, decidedByUserId }) {
  const pool = await getPool();

  // Discover the booking key first. The transaction then locks the booking as
  // the shared synchronization point used by invoice/payment creation flows.
  const referenceResult = await pool.request()
    .input('taskId', sql.BigInt, taskId)
    .query(`
      SELECT task.id, booking_room.booking_id
      FROM dbo.cleaning_tasks AS task
      LEFT JOIN dbo.booking_rooms AS booking_room ON booking_room.id = task.booking_room_id
      WHERE task.id = @taskId;
    `);
  const reference = referenceResult.recordset[0];
  if (!reference) throw compensationError('TASK_NOT_FOUND', 404, 'Cleaning task not found.');
  if (reference.booking_id == null) {
    throw compensationError('TASK_BOOKING_ROOM_INVALID', 409, 'Checkout cleaning task must reference a valid booking room.');
  }

  const transaction = new sql.Transaction(pool);
  let transactionStarted = false;
  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    transactionStarted = true;
    const bookingResult = await transaction.request()
      .input('bookingId', sql.BigInt, reference.booking_id)
      .query(`
        SELECT id
        FROM dbo.bookings WITH (UPDLOCK, HOLDLOCK)
        WHERE id = @bookingId;
      `);
    if (!bookingResult.recordset.length) {
      throw compensationError('BOOKING_NOT_FOUND', 409, 'The booking for this checkout task no longer exists.');
    }

    const invoiceResult = await transaction.request()
      .input('bookingId', sql.BigInt, reference.booking_id)
      .query(`
        SELECT TOP (1) id, status
        FROM dbo.invoices WITH (UPDLOCK, HOLDLOCK)
        WHERE booking_id = @bookingId
        ORDER BY id DESC;
      `);
    const invoice = invoiceResult.recordset[0] || null;
    if (invoice && ['PAID', 'VOID'].includes(String(invoice.status).toUpperCase())) {
      throw compensationError('INVOICE_LOCKED', 409, `Compensation cannot be changed when the invoice is ${String(invoice.status).toUpperCase()}.`);
    }

    const pendingResult = await transaction.request()
      .input('bookingId', sql.BigInt, reference.booking_id)
      .query(`
        SELECT TOP (1) id
        FROM dbo.payments WITH (UPDLOCK, HOLDLOCK)
        WHERE booking_id = @bookingId AND status = 'PENDING'
        ORDER BY id DESC;
      `);
    if (pendingResult.recordset.length) {
      throw compensationError('PAYMENT_PENDING', 409, 'Compensation cannot be changed while a payment for this booking is pending.');
    }

    const itemResult = await transaction.request()
      .input('taskId', sql.BigInt, taskId)
      .input('inspectionItemId', sql.BigInt, inspectionItemId)
      .input('bookingId', sql.BigInt, reference.booking_id)
      .query(`
        SELECT task.id AS task_id, task.task_type, task.booking_room_id, task.room_id AS task_room_id,
          booking_room.booking_id, booking_room.room_id AS booking_room_room_id,
          report.id AS inspection_id, report.room_id AS inspection_room_id,
          item.id AS inspection_item_id, item.status AS inspection_status
        FROM dbo.cleaning_tasks AS task WITH (UPDLOCK, HOLDLOCK)
        LEFT JOIN dbo.booking_rooms AS booking_room WITH (UPDLOCK, HOLDLOCK)
          ON booking_room.id = task.booking_room_id
        LEFT JOIN dbo.cleaning_task_inspections AS report WITH (UPDLOCK, HOLDLOCK)
          ON report.cleaning_task_id = task.id
        LEFT JOIN dbo.cleaning_task_inspection_items AS item WITH (UPDLOCK, HOLDLOCK)
          ON item.inspection_id = report.id AND item.id = @inspectionItemId
        WHERE task.id = @taskId;
      `);
    const item = itemResult.recordset[0];
    if (!item) throw compensationError('TASK_NOT_FOUND', 404, 'Cleaning task not found.');
    if (item.task_type !== 'CHECKOUT_CLEANING') {
      throw compensationError('TASK_TYPE_INVALID', 409, 'Equipment compensation is only available for checkout cleaning tasks.');
    }
    if (item.booking_room_id == null || item.booking_id == null
      || String(item.booking_id) !== String(reference.booking_id)
      || item.task_room_id == null || item.booking_room_room_id == null
      || Number(item.task_room_id) !== Number(item.booking_room_room_id)) {
      throw compensationError('TASK_BOOKING_ROOM_INVALID', 409, 'The checkout task and booking room references are inconsistent.');
    }
    if (item.inspection_item_id == null || item.inspection_id == null
      || item.inspection_room_id == null
      || Number(item.inspection_room_id) !== Number(item.task_room_id)) {
      throw compensationError('INSPECTION_ITEM_NOT_FOUND', 404, 'Inspection item was not found for this checkout task.');
    }
    if (!['DAMAGED', 'MISSING'].includes(String(item.inspection_status).toUpperCase())) {
      throw compensationError('INSPECTION_STATUS_INVALID', 409, 'Compensation is only available for damaged or missing equipment.');
    }

    const existingResult = await transaction.request()
      .input('inspectionItemId', sql.BigInt, inspectionItemId)
      .query(`
        SELECT id
        FROM dbo.cleaning_task_equipment_compensations WITH (UPDLOCK, HOLDLOCK)
        WHERE inspection_item_id = @inspectionItemId;
      `);
    const existing = existingResult.recordset[0];
    const saveRequest = transaction.request()
      .input('inspectionItemId', sql.BigInt, inspectionItemId)
      .input('decision', sql.VarChar(20), decision)
      .input('amount', sql.Decimal(14, 2), amount)
      .input('decidedByUserId', sql.BigInt, decidedByUserId);
    if (existing) saveRequest.input('compensationId', sql.BigInt, existing.id);
    const savedResult = await saveRequest.query(existing
        ? `
          UPDATE dbo.cleaning_task_equipment_compensations
          SET decision = @decision,
              amount = @amount,
              decided_by_user_id = @decidedByUserId,
              decided_at = SYSUTCDATETIME()
          OUTPUT CONVERT(varchar(20), INSERTED.inspection_item_id) AS inspection_item_id,
            INSERTED.decision, INSERTED.amount,
            CONVERT(varchar(20), INSERTED.decided_by_user_id) AS decided_by_user_id,
            INSERTED.decided_at,
            CONVERT(varchar(20), INSERTED.invoice_item_id) AS invoice_item_id
          WHERE id = @compensationId;
        `
        : `
          INSERT INTO dbo.cleaning_task_equipment_compensations
            (inspection_item_id, decision, amount, decided_by_user_id, decided_at, invoice_item_id)
          OUTPUT CONVERT(varchar(20), INSERTED.inspection_item_id) AS inspection_item_id,
            INSERTED.decision, INSERTED.amount,
            CONVERT(varchar(20), INSERTED.decided_by_user_id) AS decided_by_user_id,
            INSERTED.decided_at,
            CONVERT(varchar(20), INSERTED.invoice_item_id) AS invoice_item_id
          VALUES (@inspectionItemId, @decision, @amount, @decidedByUserId, SYSUTCDATETIME(), NULL);
        `);

    const saved = savedResult.recordset[0];
    if (!saved) throw new Error('Compensation decision was not returned after save.');

    await transaction.commit();
    return {
      inspection_item_id: String(saved.inspection_item_id),
      decision: saved.decision,
      amount: Number(saved.amount),
      decided_by_user_id: String(saved.decided_by_user_id),
      decided_at: saved.decided_at,
      invoice_item_id: saved.invoice_item_id == null ? null : String(saved.invoice_item_id),
    };
  } catch (error) {
    if (transactionStarted) {
      try { await transaction.rollback(); } catch (rollbackError) {
        console.error('Compensation decision rollback failed:', rollbackError);
      }
    }
    throw error;
  }
}

module.exports = { saveInspectionItemCompensation };
