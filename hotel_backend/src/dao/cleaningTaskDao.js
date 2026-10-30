const { sql, getPool } = require('../config/db');

const TASK_COLUMNS = `
  CONVERT(varchar(20), ct.id) AS id,
  ct.room_id,
  CONVERT(varchar(20), ct.booking_room_id) AS booking_room_id,
  CONVERT(varchar(20), ct.assigned_to) AS assigned_to,
  ct.priority, ct.status, ct.task_type, ct.special_instructions, ct.notes,
  ct.started_at, ct.completed_at, ct.assigned_at, ct.created_at, ct.cancelled_at,
  ct.skip_reason, ct.cancel_reason, ct.created_by_user_id,
  CAST(CASE WHEN EXISTS (
    SELECT 1 FROM dbo.cleaning_task_inspections AS inspection
    WHERE inspection.cleaning_task_id = ct.id
  ) THEN 1 ELSE 0 END AS bit) AS inspection_submitted,
  room.room_number,
  assignee.full_name AS assigned_to_name,
  creator.full_name AS created_by_name`;

function statusError(message, statusCode = 409, reason = 'invalid_transition') {
  return Object.assign(new Error(message), { statusCode, reason });
}

function isUniqueConflict(error) {
  return [error.number, error.originalError?.info?.number, ...(error.precedingErrors || []).map((item) => item.number)]
    .some((number) => number === 2601 || number === 2627);
}

function isForeignKeyConflict(error) {
  return [error.number, error.originalError?.info?.number, ...(error.precedingErrors || []).map((item) => item.number)]
    .some((number) => number === 547);
}

async function recordStatusChange(transaction, { taskId, fromStatus, toStatus, actorUserId, reason = null }) {
  await transaction.request()
    .input('taskId', sql.BigInt, taskId)
    .input('fromStatus', sql.VarChar(20), fromStatus)
    .input('toStatus', sql.VarChar(20), toStatus)
    .input('eventType', sql.VarChar(30), 'STATUS_CHANGED')
    .input('actorUserId', sql.BigInt, actorUserId)
    .input('reason', sql.NVarChar(500), reason)
    .query(`
      INSERT INTO dbo.cleaning_task_status_history
        (cleaning_task_id, from_status, to_status, event_type, actor_user_id, reason)
      VALUES (@taskId, @fromStatus, @toStatus, @eventType, @actorUserId, @reason);
    `);
}

async function findHousekeeper(transaction, userId) {
  const result = await transaction.request()
    .input('userId', sql.BigInt, userId)
    .query(`
      SELECT u.id
      FROM dbo.users AS u WITH (UPDLOCK, HOLDLOCK)
      JOIN dbo.roles AS role ON role.id = u.role_id AND role.code = 'HOUSEKEEPER'
      JOIN dbo.staff AS staff WITH (UPDLOCK, HOLDLOCK) ON staff.user_id = u.id
      WHERE u.id = @userId AND u.status = 'ACTIVE' AND staff.employment_status = 'ACTIVE';
    `);
  return result.recordset[0] || null;
}

async function findLockedTask(transaction, taskId) {
  const result = await transaction.request()
    .input('taskId', sql.BigInt, taskId)
    .query(`
      SELECT ct.id, ct.room_id, ct.status, ct.task_type, ct.assigned_to
      FROM dbo.cleaning_tasks AS ct WITH (UPDLOCK, HOLDLOCK)
      WHERE ct.id = @taskId;
    `);
  return result.recordset[0] || null;
}

async function readOneTask(request, taskId, assignedTo = null) {
  request.input('taskId', sql.BigInt, taskId);
  if (assignedTo != null) request.input('assignedToFilter', sql.BigInt, assignedTo);
  const result = await request.query(`
    SELECT ${TASK_COLUMNS}
    FROM dbo.cleaning_tasks AS ct
    JOIN dbo.rooms AS room ON room.id = ct.room_id
    LEFT JOIN dbo.users AS assignee ON assignee.id = ct.assigned_to
    LEFT JOIN dbo.users AS creator ON creator.id = ct.created_by_user_id
    WHERE ct.id = @taskId ${assignedTo == null ? '' : 'AND ct.assigned_to = @assignedToFilter'};
  `);
  return result.recordset[0] || null;
}

async function getStayoverBusinessWindow(request) {
  // Use the hotel's Asia/Ho_Chi_Minh business date while storing timestamps in UTC.
  const result = await request.query(`
    DECLARE @utcNow datetime2(7) = SYSUTCDATETIME();
    DECLARE @businessDate date = CONVERT(date, (@utcNow AT TIME ZONE 'UTC') AT TIME ZONE 'SE Asia Standard Time');
    SELECT
      @utcNow AS created_at_utc,
      CONVERT(datetime2(7), (CONVERT(datetime2(7), @businessDate) AT TIME ZONE 'SE Asia Standard Time') AT TIME ZONE 'UTC') AS day_start_utc,
      CONVERT(datetime2(7), (CONVERT(datetime2(7), DATEADD(day, 1, @businessDate)) AT TIME ZONE 'SE Asia Standard Time') AT TIME ZONE 'UTC') AS day_end_utc,
      CONVERT(char(10), @businessDate, 23) AS business_date;
  `);
  return result.recordset[0];
}

async function createTask(input, { creatorUserId, requestHash }) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const replay = await transaction.request()
      .input('requestKey', sql.UniqueIdentifier, input.request_key)
      .query(`
        SELECT TOP (1) ${TASK_COLUMNS}, ct.request_payload_hash
        FROM dbo.cleaning_tasks AS ct WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.rooms AS room ON room.id = ct.room_id
        LEFT JOIN dbo.users AS assignee ON assignee.id = ct.assigned_to
        LEFT JOIN dbo.users AS creator ON creator.id = ct.created_by_user_id
        WHERE ct.request_key = @requestKey;
      `);
    const existing = replay.recordset[0];
    if (existing) {
      const storedHash = Buffer.from(existing.request_payload_hash || []);
      if (!storedHash.equals(requestHash)) {
        throw statusError('request_key was already used with a different payload.', 409, 'idempotency_key_reused');
      }
      await transaction.commit();
      return { task: withoutHash(existing), replayed: true };
    }

    const roomResult = await transaction.request()
      .input('roomId', sql.Int, input.room_id)
      .query(`SELECT id, status FROM dbo.rooms WITH (UPDLOCK, HOLDLOCK) WHERE id = @roomId;`);
    const room = roomResult.recordset[0];
    if (!room) throw statusError('Room not found.', 404, 'room_not_found');

    let bookingStatus = null;
    if (input.booking_room_id != null) {
      const bookingRoomResult = await transaction.request()
        .input('bookingRoomId', sql.BigInt, input.booking_room_id)
        .input('roomId', sql.Int, input.room_id)
        .query(`
          SELECT br.id, br.room_id, b.status AS booking_status
          FROM dbo.booking_rooms AS br WITH (UPDLOCK, HOLDLOCK)
          JOIN dbo.bookings AS b WITH (UPDLOCK, HOLDLOCK) ON b.id = br.booking_id
          WHERE br.id = @bookingRoomId AND br.room_id = @roomId;
        `);
      const bookingRoom = bookingRoomResult.recordset[0];
      if (!bookingRoom) {
        throw statusError('booking_room_id does not belong to the specified room.', 409, 'booking_room_room_mismatch');
      }
      bookingStatus = bookingRoom.booking_status;
    }

    const stayoverWindow = await getStayoverBusinessWindow(transaction.request());
    if (input.task_type === 'STAYOVER_CLEANING') {
      const sameDayTask = await transaction.request()
        .input('bookingRoomId', sql.BigInt, input.booking_room_id)
        .input('dayStartUtc', sql.DateTime2, stayoverWindow.day_start_utc)
        .input('dayEndUtc', sql.DateTime2, stayoverWindow.day_end_utc)
        .query(`
          SELECT TOP (1) id, status
          FROM dbo.cleaning_tasks WITH (UPDLOCK, HOLDLOCK)
          WHERE booking_room_id = @bookingRoomId
            AND task_type = 'STAYOVER_CLEANING'
            AND created_at >= @dayStartUtc AND created_at < @dayEndUtc;
        `);
      if (sameDayTask.recordset[0]) {
        throw statusError('A stayover cleaning task already exists for this stay today.', 409, 'stayover_task_exists_today');
      }
    }

    const expectedBookingStatus = input.task_type === 'CHECKOUT_CLEANING' ? 'CHECKED_OUT' : 'CHECKED_IN';
    const expectedRoomStatus = input.task_type === 'CHECKOUT_CLEANING' ? 'CLEANING' : 'OCCUPIED';
    const bookingStateValid = input.task_type === 'ON_DEMAND_CLEANING' && bookingStatus == null
      ? true
      : bookingStatus === expectedBookingStatus;
    if (!bookingStateValid || room.status !== expectedRoomStatus) {
      throw statusError('The booking and room are not in a state eligible for this task type.', 409, 'room_or_booking_state_conflict');
    }

    const activeTask = await transaction.request()
      .input('roomId', sql.Int, input.room_id)
      .query(`
        SELECT TOP (1) id, status
        FROM dbo.cleaning_tasks WITH (UPDLOCK, HOLDLOCK)
        WHERE room_id = @roomId
          AND task_type IS NOT NULL
          AND status IN ('PENDING_ASSIGNMENT', 'ASSIGNED', 'IN_PROGRESS');
      `);
    if (activeTask.recordset[0]) {
      throw statusError('This room already has an active cleaning task.', 409, 'active_task_exists');
    }

    const insert = await transaction.request()
      .input('roomId', sql.Int, input.room_id)
      .input('bookingRoomId', sql.BigInt, input.booking_room_id)
      .input('priority', sql.VarChar(10), input.priority)
      .input('status', sql.VarChar(20), 'PENDING_ASSIGNMENT')
      .input('taskType', sql.VarChar(30), input.task_type)
      .input('specialInstructions', sql.NVarChar(500), input.special_instructions)
      .input('notes', sql.NVarChar(500), input.notes)
      .input('creatorUserId', sql.BigInt, creatorUserId)
      .input('createdAtUtc', sql.DateTime2, stayoverWindow?.created_at_utc ?? null)
      .input('requestKey', sql.UniqueIdentifier, input.request_key)
      .input('requestHash', sql.Binary(32), requestHash)
      .query(`
        INSERT INTO dbo.cleaning_tasks
          (room_id, booking_room_id, assigned_to, priority, status, task_type,
           special_instructions, notes, created_by_user_id, request_key, request_payload_hash, created_at)
        OUTPUT CONVERT(varchar(20), INSERTED.id) AS id
        VALUES
          (@roomId, @bookingRoomId, NULL, COALESCE(@priority, 'MEDIUM'), @status, @taskType,
           @specialInstructions, @notes, @creatorUserId, @requestKey, @requestHash, @createdAtUtc);
      `);
    const taskId = insert.recordset[0]?.id;
    if (!taskId) throw new Error('Cleaning task insert did not return an ID.');

    await recordStatusChange(transaction, {
      taskId,
      fromStatus: null,
      toStatus: 'PENDING_ASSIGNMENT',
      actorUserId: creatorUserId,
    });
    const task = await readOneTask(transaction.request(), taskId);
    await transaction.commit();
    return { task, replayed: false };
  } catch (error) {
    try { await transaction.rollback(); } catch (rollbackError) {
      console.error('Cleaning task creation rollback failed:', rollbackError);
    }
    if (isUniqueConflict(error)) throw statusError('A task or request with these details already exists. Refresh the task list and try again.', 409, 'duplicate_conflict');
    if (isForeignKeyConflict(error)) throw statusError('The room, booking room, creator, or request reference changed before the task was saved.', 409, 'reference_conflict');
    throw error;
  }
}

async function createStayoverTasksForToday(creatorUserId) {
  const pool = await getPool();
  const window = await getStayoverBusinessWindow(pool.request());
  const candidatesResult = await pool.request().query(`
    SELECT CONVERT(varchar(20), br.id) AS booking_room_id, br.room_id, room.room_number
    FROM dbo.booking_rooms AS br
    JOIN dbo.bookings AS booking ON booking.id = br.booking_id
      LEFT JOIN dbo.rooms AS room ON room.id = br.room_id
    WHERE booking.status = 'CHECKED_IN'
    ORDER BY br.room_id, br.id;
  `);

  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  const created = [];
  const skipped = [];
  try {
    for (const candidate of candidatesResult.recordset) {
      if (candidate.room_id == null) {
        skipped.push({
          booking_room_id: String(candidate.booking_room_id), room_id: null,
          room_number: candidate.room_number, reason: 'booking_room_has_no_room',
        });
        continue;
      }
      const roomResult = await transaction.request()
        .input('roomId', sql.Int, candidate.room_id)
        .query(`SELECT id, status FROM dbo.rooms WITH (UPDLOCK, HOLDLOCK) WHERE id = @roomId;`);
      if (!roomResult.recordset[0]) {
        skipped.push({
          booking_room_id: String(candidate.booking_room_id), room_id: candidate.room_id,
          room_number: candidate.room_number, reason: 'room_not_found',
        });
        continue;
      }
      if (roomResult.recordset[0].status !== 'OCCUPIED') {
        skipped.push({
          booking_room_id: String(candidate.booking_room_id), room_id: candidate.room_id,
          room_number: candidate.room_number, reason: 'room_not_occupied',
        });
        continue;
      }

      const stayResult = await transaction.request()
        .input('bookingRoomId', sql.BigInt, candidate.booking_room_id)
        .input('roomId', sql.Int, candidate.room_id)
        .query(`
          SELECT br.id
          FROM dbo.booking_rooms AS br WITH (UPDLOCK, HOLDLOCK)
          JOIN dbo.bookings AS booking WITH (UPDLOCK, HOLDLOCK) ON booking.id = br.booking_id
          WHERE br.id = @bookingRoomId AND br.room_id = @roomId
            AND booking.status = 'CHECKED_IN';
        `);
      if (!stayResult.recordset[0]) {
        skipped.push({
          booking_room_id: String(candidate.booking_room_id), room_id: candidate.room_id,
          room_number: candidate.room_number, reason: 'booking_no_longer_checked_in',
        });
        continue;
      }

      const sameDayResult = await transaction.request()
        .input('bookingRoomId', sql.BigInt, candidate.booking_room_id)
        .input('dayStartUtc', sql.DateTime2, window.day_start_utc)
        .input('dayEndUtc', sql.DateTime2, window.day_end_utc)
        .query(`
          SELECT TOP (1) id, status
          FROM dbo.cleaning_tasks WITH (UPDLOCK, HOLDLOCK)
          WHERE booking_room_id = @bookingRoomId
            AND task_type = 'STAYOVER_CLEANING'
            AND created_at >= @dayStartUtc AND created_at < @dayEndUtc
          ORDER BY created_at DESC, id DESC;
        `);
      const sameDayTask = sameDayResult.recordset[0];
      if (sameDayTask) {
        const reason = sameDayTask.status === 'COMPLETED'
          ? 'stayover_completed_today'
          : sameDayTask.status === 'SKIPPED'
            ? 'stayover_skipped_today'
            : 'stayover_already_created_today';
        skipped.push({
          booking_room_id: String(candidate.booking_room_id), room_id: candidate.room_id,
          room_number: candidate.room_number, reason,
        });
        continue;
      }

      const activeResult = await transaction.request()
        .input('roomId', sql.Int, candidate.room_id)
        .query(`
          SELECT TOP (1) id
          FROM dbo.cleaning_tasks WITH (UPDLOCK, HOLDLOCK)
          WHERE room_id = @roomId
            AND (task_type IS NULL OR task_type <> 'STAYOVER_CLEANING')
            AND status IN ('NOT_STARTED', 'PENDING_ASSIGNMENT', 'ASSIGNED', 'IN_PROGRESS');
        `);
      if (activeResult.recordset[0]) {
        skipped.push({
          booking_room_id: String(candidate.booking_room_id), room_id: candidate.room_id,
          room_number: candidate.room_number, reason: 'other_active_cleaning_task',
        });
        continue;
      }

      const insertResult = await transaction.request()
        .input('roomId', sql.Int, candidate.room_id)
        .input('bookingRoomId', sql.BigInt, candidate.booking_room_id)
        .input('creatorUserId', sql.BigInt, creatorUserId)
        .input('createdAtUtc', sql.DateTime2, window.created_at_utc)
        .query(`
          INSERT INTO dbo.cleaning_tasks
            (room_id, booking_room_id, assigned_to, priority, status, task_type,
             created_by_user_id, created_at)
          OUTPUT CONVERT(varchar(20), INSERTED.id) AS id
          VALUES
            (@roomId, @bookingRoomId, NULL, 'MEDIUM', 'PENDING_ASSIGNMENT',
             'STAYOVER_CLEANING', @creatorUserId, @createdAtUtc);
        `);
      const taskId = insertResult.recordset[0]?.id;
      if (!taskId) throw new Error('Stayover task insert did not return an ID.');

      await recordStatusChange(transaction, {
        taskId, fromStatus: null, toStatus: 'PENDING_ASSIGNMENT', actorUserId: creatorUserId,
      });
      const task = await readOneTask(transaction.request(), taskId);
      created.push(task);
    }

    await transaction.commit();
    return {
      business_date: window.business_date,
      created_count: created.length,
      skipped_count: skipped.length,
      created,
      skipped,
    };
  } catch (error) {
    try { await transaction.rollback(); } catch (rollbackError) {
      console.error('Bulk stayover task rollback failed:', rollbackError);
    }
    if (isUniqueConflict(error)) throw statusError('A task uniqueness constraint rejected the bulk operation.', 409, 'duplicate_conflict');
    if (isForeignKeyConflict(error)) throw statusError('A room, stay, or creator reference changed before the bulk operation completed.', 409, 'reference_conflict');
    throw error;
  }
}

function withoutHash(task) {
  const { request_payload_hash: _requestPayloadHash, ...safeTask } = task;
  return safeTask;
}

async function listTasks(filters, { assignedTo = null } = {}) {
  const pool = await getPool();
  const request = pool.request().input('limit', sql.Int, filters.limit);
  const clauses = [];
  if (filters.status) {
    request.input('status', sql.VarChar(20), filters.status);
    clauses.push('ct.status = @status');
  }
  if (filters.task_type) {
    request.input('taskType', sql.VarChar(30), filters.task_type);
    clauses.push('ct.task_type = @taskType');
  }
  if (filters.room_id) {
    request.input('roomId', sql.Int, filters.room_id);
    clauses.push('ct.room_id = @roomId');
  }
  if (filters.assigned_to) {
    request.input('assignedTo', sql.BigInt, filters.assigned_to);
    clauses.push('ct.assigned_to = @assignedTo');
  }
  if (filters.business_date) {
    request.input('businessDate', sql.VarChar(10), filters.business_date);
    clauses.push('ct.created_at >= @businessDayStartUtc');
    clauses.push('ct.created_at < @businessDayEndUtc');
  }
  if (assignedTo != null) {
    request.input('housekeeperId', sql.BigInt, assignedTo);
    clauses.push('ct.assigned_to = @housekeeperId');
  }
  const businessDayBounds = filters.business_date ? `
    DECLARE @businessDayStartUtc datetime2(7) = CONVERT(datetime2(7),
      (CONVERT(datetime2(7), CONVERT(date, @businessDate, 23)) AT TIME ZONE 'SE Asia Standard Time') AT TIME ZONE 'UTC');
    DECLARE @businessDayEndUtc datetime2(7) = CONVERT(datetime2(7),
      (DATEADD(day, 1, CONVERT(datetime2(7), CONVERT(date, @businessDate, 23))) AT TIME ZONE 'SE Asia Standard Time') AT TIME ZONE 'UTC');
  ` : '';
  const orderBy = assignedTo != null ? `
    CASE ct.status
      WHEN 'IN_PROGRESS' THEN 1
      WHEN 'ASSIGNED' THEN 2 WHEN 'NOT_STARTED' THEN 2
      WHEN 'COMPLETED' THEN 3 ELSE 4 END,
    CASE WHEN ct.status = 'IN_PROGRESS' THEN ct.started_at END DESC,
    CASE ct.priority
      WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END,
    ct.id DESC
  ` : `
    CASE ct.status
      WHEN 'PENDING_ASSIGNMENT' THEN 1 WHEN 'ASSIGNED' THEN 2 WHEN 'IN_PROGRESS' THEN 3
      WHEN 'NOT_STARTED' THEN 4 WHEN 'UNDER_MAINTENANCE' THEN 5 ELSE 6 END,
    CASE ct.priority
      WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END,
    ct.id DESC
  `;
  const result = await request.query(`
    ${businessDayBounds}
    SELECT TOP (@limit) ${TASK_COLUMNS}
    FROM dbo.cleaning_tasks AS ct
    JOIN dbo.rooms AS room ON room.id = ct.room_id
    LEFT JOIN dbo.users AS assignee ON assignee.id = ct.assigned_to
    LEFT JOIN dbo.users AS creator ON creator.id = ct.created_by_user_id
    ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
    ORDER BY ${orderBy};
  `);
  return result.recordset;
}

async function getTask(taskId, { assignedTo = null } = {}) {
  const pool = await getPool();
  const task = await readOneTask(pool.request(), taskId, assignedTo);
  if (!task) return null;
  const history = await pool.request()
    .input('taskId', sql.BigInt, taskId)
    .query(`
      SELECT CONVERT(varchar(20), history.id) AS id,
        history.from_status, history.to_status, history.event_type,
        CONVERT(varchar(20), history.actor_user_id) AS actor_user_id,
        actor.full_name AS actor_name, history.occurred_at, history.reason
      FROM dbo.cleaning_task_status_history AS history
      LEFT JOIN dbo.users AS actor ON actor.id = history.actor_user_id
      WHERE history.cleaning_task_id = @taskId
      ORDER BY history.occurred_at, history.id;
    `);
  return { ...task, status_history: history.recordset };
}

async function listAssignableHousekeepers() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT CONVERT(varchar(20), u.id) AS id, u.full_name
    FROM dbo.users AS u
    JOIN dbo.roles AS role ON role.id = u.role_id AND role.code = 'HOUSEKEEPER'
    JOIN dbo.staff AS staff ON staff.user_id = u.id AND staff.employment_status = 'ACTIVE'
    WHERE u.status = 'ACTIVE'
    ORDER BY u.full_name, u.id;
  `);
  return result.recordset;
}

async function listCheckoutRoomAssignments(bookingId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('bookingId', sql.BigInt, bookingId)
    .query(`
      SELECT CONVERT(varchar(20), br.id) AS booking_room_id,
        br.room_id, room.room_number, room.status AS room_status, booking.status AS booking_status,
        CONVERT(varchar(20), task.id) AS task_id, task.status AS task_status,
        CONVERT(varchar(20), task.assigned_to) AS assigned_to, assignee.full_name AS assigned_to_name,
        CAST(CASE WHEN EXISTS (
          SELECT 1 FROM dbo.cleaning_task_inspections AS inspection
          WHERE inspection.cleaning_task_id = task.id
        ) THEN 1 ELSE 0 END AS bit) AS inspection_submitted
      FROM dbo.booking_rooms AS br
      JOIN dbo.bookings AS booking ON booking.id = br.booking_id
      LEFT JOIN dbo.rooms AS room ON room.id = br.room_id
      OUTER APPLY (
        SELECT TOP (1) ct.id, ct.status, ct.assigned_to
        FROM dbo.cleaning_tasks AS ct
        WHERE ct.booking_room_id = br.id AND ct.room_id = br.room_id
          AND ct.task_type = 'CHECKOUT_CLEANING'
        ORDER BY ct.id DESC
      ) AS task
      LEFT JOIN dbo.users AS assignee ON assignee.id = task.assigned_to
      WHERE br.booking_id = @bookingId
      ORDER BY room.room_number, br.id;
    `);
  return result.recordset;
}

async function assignCheckoutRoomTask({ bookingId, bookingRoomId, roomId, housekeeperId, actorUserId }) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const roomResult = await transaction.request()
      .input('bookingId', sql.BigInt, bookingId)
      .input('bookingRoomId', sql.BigInt, bookingRoomId)
      .input('roomId', sql.Int, roomId)
      .query(`
        SELECT booking.status AS booking_status, br.room_id, room.status AS room_status
        FROM dbo.bookings AS booking WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.booking_rooms AS br WITH (UPDLOCK, HOLDLOCK) ON br.booking_id = booking.id
        JOIN dbo.rooms AS room WITH (UPDLOCK, HOLDLOCK) ON room.id = br.room_id
        WHERE booking.id = @bookingId AND br.id = @bookingRoomId AND br.room_id = @roomId;
      `);
    const bookingRoom = roomResult.recordset[0];
    if (!bookingRoom) throw statusError('This room is not part of the selected booking.', 404, 'booking_room_not_found');

    const existingResult = await transaction.request()
      .input('bookingRoomId', sql.BigInt, bookingRoomId)
      .input('roomId', sql.Int, roomId)
      .query(`
        SELECT TOP (1) id, status, assigned_to
        FROM dbo.cleaning_tasks WITH (UPDLOCK, HOLDLOCK)
        WHERE booking_room_id = @bookingRoomId AND room_id = @roomId
          AND task_type = 'CHECKOUT_CLEANING'
        ORDER BY id DESC;
      `);
    const existing = existingResult.recordset[0];
    if (existing) {
      if (existing.assigned_to == null && existing.status === 'PENDING_ASSIGNMENT') {
        if (!await findHousekeeper(transaction, housekeeperId)) {
          throw statusError('The selected user is not an active housekeeper.', 400, 'invalid_housekeeper');
        }
        const update = await transaction.request()
          .input('taskId', sql.BigInt, existing.id)
          .input('housekeeperId', sql.BigInt, housekeeperId)
          .query(`
            UPDATE dbo.cleaning_tasks
            SET assigned_to = @housekeeperId, assigned_at = SYSUTCDATETIME(), status = 'ASSIGNED'
            OUTPUT DELETED.status AS from_status
            WHERE id = @taskId AND assigned_to IS NULL AND status = 'PENDING_ASSIGNMENT';
          `);
        if (!update.recordset[0]) throw statusError('The checkout task changed before assignment completed.', 409);
        await recordStatusChange(transaction, {
          taskId: existing.id,
          fromStatus: update.recordset[0].from_status,
          toStatus: 'ASSIGNED',
          actorUserId,
        });
        const task = await readOneTask(transaction.request(), String(existing.id));
        await transaction.commit();
        return { task, already_assigned: false, created: false };
      }
      if (String(existing.assigned_to) !== String(housekeeperId)) {
        throw statusError('A checkout cleaning task already exists for this room and is assigned to another housekeeper. Reassignment is not performed here.', 409, 'checkout_task_assigned_to_other');
      }
      const task = await readOneTask(transaction.request(), String(existing.id));
      await transaction.commit();
      return { task, already_assigned: true, created: false };
    }

    const preCheckoutEligible = bookingRoom.booking_status === 'CHECKED_IN' && bookingRoom.room_status === 'OCCUPIED';
    const postCheckoutEligible = bookingRoom.booking_status === 'CHECKED_OUT' && bookingRoom.room_status === 'CLEANING';
    if (!preCheckoutEligible && !postCheckoutEligible) {
      throw statusError('The booking room is not in a valid checkout cleaning state.', 409, 'checkout_room_state_conflict');
    }
    if (!await findHousekeeper(transaction, housekeeperId)) {
      throw statusError('The selected user is not an active housekeeper.', 400, 'invalid_housekeeper');
    }

    const activeResult = await transaction.request()
      .input('roomId', sql.Int, roomId)
      .query(`
        SELECT TOP (1) id, task_type, status, assigned_to
        FROM dbo.cleaning_tasks WITH (UPDLOCK, HOLDLOCK)
        WHERE room_id = @roomId AND task_type IS NOT NULL
          AND status IN ('NOT_STARTED', 'PENDING_ASSIGNMENT', 'ASSIGNED', 'IN_PROGRESS');
      `);
    if (activeResult.recordset[0]) {
      throw statusError('This room already has an active cleaning task; no checkout task was created.', 409, 'active_task_exists');
    }

    const insert = await transaction.request()
      .input('roomId', sql.Int, roomId)
      .input('bookingRoomId', sql.BigInt, bookingRoomId)
      .input('housekeeperId', sql.BigInt, housekeeperId)
      .input('actorUserId', sql.BigInt, actorUserId)
      .query(`
        INSERT INTO dbo.cleaning_tasks
          (room_id, booking_room_id, assigned_to, priority, status, task_type,
           assigned_at, created_by_user_id, created_at)
        OUTPUT CONVERT(varchar(20), INSERTED.id) AS id
        VALUES (@roomId, @bookingRoomId, @housekeeperId, 'MEDIUM', 'ASSIGNED',
                'CHECKOUT_CLEANING', SYSUTCDATETIME(), @actorUserId, SYSUTCDATETIME());
      `);
    const taskId = insert.recordset[0]?.id;
    if (!taskId) throw new Error('Checkout cleaning task insert did not return an ID.');

    await recordStatusChange(transaction, {
      taskId,
      fromStatus: null,
      toStatus: 'ASSIGNED',
      actorUserId,
    });
    const task = await readOneTask(transaction.request(), taskId);
    await transaction.commit();
    return { task, already_assigned: false, created: true };
  } catch (error) {
    try { await transaction.rollback(); } catch (rollbackError) {
      console.error('Checkout cleaning assignment rollback failed:', rollbackError);
    }
    if (isUniqueConflict(error)) throw statusError('A checkout cleaning task already exists for this room.', 409, 'duplicate_conflict');
    if (isForeignKeyConflict(error)) throw statusError('The room, booking, creator, or housekeeper reference changed before the task was saved.', 409, 'reference_conflict');
    throw error;
  }
}

async function assignTask(taskId, housekeeperId, actorUserId) {
  return transitionTask(taskId, actorUserId, async (transaction, task) => {
    if (task.status !== 'PENDING_ASSIGNMENT') {
      throw statusError('Only a pending task can be assigned. Legacy task states are read-only.', 409);
    }
    if (!await findHousekeeper(transaction, housekeeperId)) {
      throw statusError('The selected user is not an active housekeeper.', 400, 'invalid_housekeeper');
    }
    const update = await transaction.request()
      .input('taskId', sql.BigInt, taskId)
      .input('housekeeperId', sql.BigInt, housekeeperId)
      .query(`
        UPDATE dbo.cleaning_tasks
        SET assigned_to = @housekeeperId, assigned_at = SYSUTCDATETIME(), status = 'ASSIGNED'
        OUTPUT DELETED.status AS from_status
        WHERE id = @taskId AND status = 'PENDING_ASSIGNMENT';
      `);
    if (!update.recordset[0]) throw statusError('Task changed before assignment completed.', 409);
    await recordStatusChange(transaction, {
      taskId, fromStatus: update.recordset[0].from_status, toStatus: 'ASSIGNED', actorUserId,
    });
  });
}

async function startTask(taskId, actorUserId) {
  return transitionTask(taskId, actorUserId, async (transaction, task) => {
    assertAssignedToActor(task, actorUserId);
    if (task.status !== 'ASSIGNED') throw statusError('Only an assigned task can be started.');
    const update = await transaction.request()
      .input('taskId', sql.BigInt, taskId)
      .input('actorUserId', sql.BigInt, actorUserId)
      .query(`
        UPDATE dbo.cleaning_tasks
        SET status = 'IN_PROGRESS', started_at = SYSUTCDATETIME()
        OUTPUT DELETED.status AS from_status
        WHERE id = @taskId AND status = 'ASSIGNED' AND assigned_to = @actorUserId;
      `);
    if (!update.recordset[0]) throw statusError('Task changed before it could be started.', 409);
    await recordStatusChange(transaction, {
      taskId, fromStatus: update.recordset[0].from_status, toStatus: 'IN_PROGRESS', actorUserId,
    });
  });
}

async function completeTask(taskId, actorUserId) {
  return transitionTask(taskId, actorUserId, async (transaction, task) => {
    assertAssignedToActor(task, actorUserId);
    if (task.status !== 'IN_PROGRESS') throw statusError('Only an in-progress task can be completed.');
    if (task.task_type === 'CHECKOUT_CLEANING') {
      const report = await transaction.request()
        .input('taskId', sql.BigInt, taskId)
        .input('roomId', sql.Int, task.room_id)
        .query(`
          SELECT TOP (1) id
          FROM dbo.cleaning_task_inspections WITH (UPDLOCK, HOLDLOCK)
          WHERE cleaning_task_id = @taskId AND room_id = @roomId;
        `);
      if (!report.recordset[0]) {
        throw statusError('Submit the room equipment inspection before completing checkout cleaning.', 409, 'inspection_required');
      }
    }
    const update = await transaction.request()
      .input('taskId', sql.BigInt, taskId)
      .input('actorUserId', sql.BigInt, actorUserId)
      .query(`
        UPDATE dbo.cleaning_tasks
        SET status = 'COMPLETED', completed_at = SYSUTCDATETIME()
        OUTPUT DELETED.status AS from_status
        WHERE id = @taskId AND status = 'IN_PROGRESS' AND assigned_to = @actorUserId;
      `);
    if (!update.recordset[0]) throw statusError('Task changed before it could be completed.', 409);
    await recordStatusChange(transaction, {
      taskId, fromStatus: update.recordset[0].from_status, toStatus: 'COMPLETED', actorUserId,
    });
  });
}

async function skipTask(taskId, actorUserId, reason) {
  return transitionTask(taskId, actorUserId, async (transaction, task) => {
    assertAssignedToActor(task, actorUserId);
    if (task.task_type !== 'STAYOVER_CLEANING' || task.status !== 'ASSIGNED') {
      throw statusError('Only an assigned stayover task can be skipped.', 409);
    }
    const update = await transaction.request()
      .input('taskId', sql.BigInt, taskId)
      .input('actorUserId', sql.BigInt, actorUserId)
      .input('reason', sql.NVarChar(500), reason)
      .query(`
        UPDATE dbo.cleaning_tasks
        SET status = 'SKIPPED', skip_reason = @reason
        OUTPUT DELETED.status AS from_status
        WHERE id = @taskId AND status = 'ASSIGNED' AND task_type = 'STAYOVER_CLEANING'
          AND assigned_to = @actorUserId;
      `);
    if (!update.recordset[0]) throw statusError('Task changed before it could be skipped.', 409);
    await recordStatusChange(transaction, {
      taskId, fromStatus: update.recordset[0].from_status, toStatus: 'SKIPPED', actorUserId, reason,
    });
  });
}

function assertAssignedToActor(task, actorUserId) {
  if (String(task.assigned_to) !== String(actorUserId)) {
    throw statusError('This task is not assigned to the authenticated housekeeper.', 403, 'task_not_assigned_to_actor');
  }
}

async function transitionTask(taskId, actorUserId, updateAndRecord) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const task = await findLockedTask(transaction, taskId);
    if (!task) throw statusError('Cleaning task not found.', 404, 'task_not_found');
    await updateAndRecord(transaction, task);
    const updated = await readOneTask(transaction.request(), taskId);
    await transaction.commit();
    return updated;
  } catch (error) {
    try { await transaction.rollback(); } catch (rollbackError) {
      console.error('Cleaning task transition rollback failed:', rollbackError);
    }
    if (isUniqueConflict(error)) throw statusError('A cleaning task uniqueness constraint rejected this change.', 409, 'duplicate_conflict');
    if (isForeignKeyConflict(error)) throw statusError('A referenced task user no longer exists.', 409, 'reference_conflict');
    throw error;
  }
}

module.exports = {
  createTask,
  createStayoverTasksForToday,
  listTasks,
  getTask,
  listAssignableHousekeepers,
  listCheckoutRoomAssignments,
  assignCheckoutRoomTask,
  assignTask,
  startTask,
  completeTask,
  skipTask,
};
