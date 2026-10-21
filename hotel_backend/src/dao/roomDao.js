const { sql, getPool } = require('../config/db');
const RoomModel = require('../models/roomModel');

function quoteSqlIdentifier(identifier) {
  return `[${String(identifier).replace(/]/g, ']]')}]`;
}

function activeReservationPredicate(alias) {
  return `(${alias}.status = 'CHECKED_IN' OR (${alias}.status = 'PENDING_PAYMENT' AND ${alias}.created_at > DATEADD(minute, -15, SYSUTCDATETIME())) OR ${alias}.status = 'CONFIRMED')`;
}

/**
 * ============================================================================
 * CHỨC NĂNG: KIỂM TRA PHÒNG TRỐNG (CHECK ROOM AVAILABILITY) - DAO
 * ============================================================================
 * Module này chịu trách nhiệm truy vấn dữ liệu từ SQL Server để:
 * 1. Lấy danh sách tất cả các loại phòng (Room Types) cùng hình ảnh, tiện nghi, đánh giá.
 * 2. Tính toán số lượng phòng thực tế còn trống (available_rooms) trong khoảng thời gian
 *    từ ngày check_in_date đến check_out_date đã chọn.
 * 3. Lấy danh sách số phòng vật lý cụ thể (room_number) đang trống để lễ tân
 *    dễ dàng chọn phòng khi làm thủ tục đặt phòng trực tiếp tại quầy (walk-in).
 */

/**
 * Kiểm tra danh sách loại phòng và số phòng trống cho từng loại phòng theo ngày
 * @param {Object} params
 * @param {string} params.checkInDate - Ngày nhận phòng (YYYY-MM-DD)
 * @param {string} params.checkOutDate - Ngày trả phòng (YYYY-MM-DD)
 * @param {number} [params.adults] - Số người lớn
 * @param {number} [params.children] - Số trẻ em
 * @returns {Promise<Array>} Danh sách loại phòng kèm tình trạng phòng trống
 */
async function checkRoomAvailability({ checkInDate, checkOutDate, adults = 1, children = 0, excludeBookingId = null }) {
  const pool = await getPool();

  // 1. Truy vấn thông tin cơ bản của tất cả các loại phòng
  const roomTypesResult = await pool.request().query(`
    SELECT
      rt.id,
      rt.name,
      rt.description,
      rt.base_price,
      rt.max_adults,
      rt.max_children,
      (
        SELECT TOP 1 rti.image_url
        FROM room_type_images rti
        WHERE rti.room_type_id = rt.id AND rti.is_primary = 1
        ORDER BY rti.id
      ) AS image_url,
      (
        SELECT STRING_AGG(a.name, ', ')
        FROM room_type_amenities rta
        JOIN amenities a ON a.id = rta.amenity_id
        WHERE rta.room_type_id = rt.id
      ) AS amenities,
      (
        SELECT AVG(r.rating)
        FROM reviews r
        WHERE r.room_type_id = rt.id AND r.is_hidden = 0
      ) AS average_rating,
      (
        SELECT COUNT(*)
        FROM reviews r
        WHERE r.room_type_id = rt.id AND r.is_hidden = 0
      ) AS review_count
    FROM room_types rt
    ORDER BY rt.id;
  `);

  const roomTypes = roomTypesResult.recordset;

  // 2. Truy vấn tất cả phòng vật lý đang hoạt động (không ở trạng thái bảo trì/ngừng hoạt động)
  // và xác định phòng nào bị trùng lịch đặt (is_booked) trong khoảng [checkInDate, checkOutDate)
  // Một booking được coi là trùng lịch khi:
  // booking.check_in_date < @checkOutDate VÀ booking.check_out_date > @checkInDate
  // đồng thời trạng thái booking không bị hủy ('CANCELLED')
  const roomsResult = await pool.request()
    .input('checkIn', sql.Date, checkInDate)
    .input('checkOut', sql.Date, checkOutDate)
    .input('excludeBookingId', sql.BigInt, excludeBookingId == null ? null : Number(excludeBookingId))
    .query(`
      SELECT
        r.id,
        r.room_number,
        r.room_type_id,
        r.floor,
        r.status AS physical_status,
        CASE
          WHEN bk.room_id IS NOT NULL THEN 1
          ELSE 0
        END AS is_booked
      FROM rooms r
      LEFT JOIN (
        SELECT DISTINCT br.room_id
        FROM booking_rooms br
        JOIN bookings b ON b.id = br.booking_id
        WHERE br.room_id IS NOT NULL
          AND ${activeReservationPredicate('b')}
          AND (@excludeBookingId IS NULL OR b.id <> @excludeBookingId)
          AND b.check_in_date < @checkOut
          AND b.check_out_date > @checkIn
      ) bk ON bk.room_id = r.id
      WHERE r.status NOT IN ('MAINTENANCE', 'CLEANING');
    `);

  const rooms = roomsResult.recordset;

  // 3. Truy vấn các booking đã đặt nhưng chưa được gán số phòng cụ thể (room_id IS NULL)
  // để trừ vào số lượng phòng trống của loại phòng tương ứng
  // Count all active booking room rows by type, assigned or unassigned.
  const reservedBookingsResult = await pool.request()
    .input('checkIn', sql.Date, checkInDate)
    .input('checkOut', sql.Date, checkOutDate)
    .input('excludeBookingId', sql.BigInt, excludeBookingId == null ? null : Number(excludeBookingId))
    .query(`
      SELECT br.room_type_id, COUNT(*) AS reserved_count
      FROM booking_rooms br
      JOIN bookings b ON b.id = br.booking_id
      WHERE ${activeReservationPredicate('b')}
        AND (@excludeBookingId IS NULL OR b.id <> @excludeBookingId)
        AND b.check_in_date < @checkOut
        AND b.check_out_date > @checkIn
      GROUP BY br.room_type_id;
    `);

  const reservedCountByType = new Map();
  for (const row of reservedBookingsResult.recordset) {
    reservedCountByType.set(row.room_type_id, Number(row.reserved_count));
  }

  // 4. Tổng hợp dữ liệu tình trạng phòng theo từng loại phòng
  return roomTypes.map((type) => {
    // Tất cả phòng vật lý thuộc loại phòng này
    const typeRooms = rooms.filter((r) => r.room_type_id === type.id);
    const totalRooms = typeRooms.length;

    // Danh sách các phòng vật lý chưa bị đặt (is_booked == 0)
    const availablePhysicalRooms = typeRooms.filter((r) => r.is_booked === 0);

    // Số lượng phòng đã đặt chưa gán số phòng
    const reservedCount = reservedCountByType.get(type.id) || 0;

    // Số phòng đã được đặt thực tế (gồm có phòng chỉ định + phòng chưa gán số)
    // Each active booking room row consumes one unit of the room type inventory.
    const bookedRoomsCount = reservedCount;

    // Số lượng phòng thực sự còn trống cho khách đặt
    const availableCount = Math.max(0, totalRooms - bookedRoomsCount);

    // Danh sách số phòng cụ thể còn trống (cắt theo availableCount)
    const availableRoomNumbers = availablePhysicalRooms.slice(0, availableCount).map((r) => ({
      id: r.id,
      room_number: r.room_number,
      floor: r.floor,
      status: r.physical_status,
    }));

    // Kiểm tra sức chứa có phù hợp với số khách tìm kiếm không
    const capacityMatched =
      type.max_adults >= Number(adults) &&
      type.max_children >= Number(children);

    return {
      id: type.id,
      name: type.name,
      description: type.description,
      base_price: Number(type.base_price ?? 0),
      max_adults: type.max_adults ?? 0,
      max_children: type.max_children ?? 0,
      image_url: type.image_url || null,
      amenities: String(type.amenities || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
      average_rating: Number((type.average_rating ?? 0).toFixed(1)),
      review_count: Number(type.review_count ?? 0),
      // --- CÁC TRƯỜNG PHỤC VỤ CHECK AVAILABILITY ---
      total_rooms: totalRooms, // Tổng số phòng khách sạn có của loại này
      booked_rooms: bookedRoomsCount, // Số phòng đã bị đặt trong thời gian này
      available_rooms: availableCount, // Số phòng còn trống thực tế
      is_available: availableCount > 0, // Trạng thái còn phòng hay đã hết phòng
      capacity_matched: capacityMatched, // Loại phòng có đủ sức chứa cho số khách yêu cầu
      available_room_list: availableRoomNumbers, // Danh sách phòng trống để lễ tân chọn tại quầy
    };
  });
}

/**
 * Lấy danh sách phòng vật lý còn trống của một loại phòng cụ thể theo khoảng ngày
 * (Dùng cho dropdown chọn phòng khi Lễ tân tạo đơn đặt phòng tại quầy)
 * @param {Object} params
 * @param {number} params.roomTypeId - ID của loại phòng
 * @param {string} params.checkInDate - Ngày nhận phòng
 * @param {string} params.checkOutDate - Ngày trả phòng
 * @returns {Promise<Array>} Danh sách phòng trống
 */
async function getAvailableRoomsForType({ roomTypeId, checkInDate, checkOutDate }) {
  const pool = await getPool();

  const result = await pool.request()
    .input('roomTypeId', sql.Int, Number(roomTypeId))
    .input('checkIn', sql.Date, checkInDate)
    .input('checkOut', sql.Date, checkOutDate)
    .query(`
      SELECT
        r.id,
        r.room_number,
        r.room_type_id,
        r.floor,
        r.status
      FROM rooms r
      WHERE r.room_type_id = @roomTypeId
        AND r.status NOT IN ('MAINTENANCE', 'CLEANING')
        AND r.id NOT IN (
          SELECT DISTINCT br.room_id
          FROM booking_rooms br
          JOIN bookings b ON b.id = br.booking_id
          WHERE br.room_id IS NOT NULL
            AND ${activeReservationPredicate('b')}
            AND b.check_in_date < @checkOut
            AND b.check_out_date > @checkIn
        )
      ORDER BY r.room_number;
    `);

  return result.recordset;
}

async function getRoomList() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT r.id, r.room_number, r.room_type_id, rt.name AS room_type_name,
      r.floor, r.status
    FROM dbo.rooms r
    INNER JOIN dbo.room_types rt ON rt.id = r.room_type_id
    ORDER BY r.floor, r.room_number;
  `);
  return RoomModel.fromRows(result.recordset);
}

async function getRoomDetails(roomId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('roomId', sql.Int, roomId)
    .query(`
      SELECT r.id, r.room_number, r.room_type_id, rt.name AS room_type_name,
        r.floor, r.status, rt.description AS room_type_description,
        rt.base_price, rt.max_adults, rt.max_children
      FROM dbo.rooms r
      INNER JOIN dbo.room_types rt ON rt.id = r.room_type_id
      WHERE r.id = @roomId;
    `);
  return RoomModel.fromRow(result.recordset[0]);
}

async function createRoom({ roomNumber, roomTypeId, floor }) {
  const pool = await getPool();
  let transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const roomTypeResult = await new sql.Request(transaction)
      .input('roomTypeId', sql.Int, roomTypeId)
      .query('SELECT id FROM dbo.room_types WITH (UPDLOCK, HOLDLOCK) WHERE id = @roomTypeId;');

    if (!roomTypeResult.recordset.length) {
      await transaction.rollback();
      transaction = null;
      return { reason: 'ROOM_TYPE_NOT_FOUND' };
    }

    const existingRoom = await new sql.Request(transaction)
      .input('roomNumber', sql.VarChar(10), roomNumber)
      .query('SELECT id FROM dbo.rooms WITH (UPDLOCK, HOLDLOCK) WHERE room_number = @roomNumber;');

    if (existingRoom.recordset.length) {
      await transaction.rollback();
      transaction = null;
      return { reason: 'ROOM_NUMBER_EXISTS' };
    }

    const result = await new sql.Request(transaction)
      .input('roomNumber', sql.VarChar(10), roomNumber)
      .input('roomTypeId', sql.Int, roomTypeId)
      .input('floor', sql.TinyInt, floor)
      .query(`
        INSERT INTO dbo.rooms (room_number, room_type_id, floor, status)
        OUTPUT INSERTED.id, INSERTED.room_number, INSERTED.room_type_id,
               INSERTED.floor, INSERTED.status
        VALUES (@roomNumber, @roomTypeId, @floor, 'AVAILABLE');
      `);

    await transaction.commit();
    transaction = null;
    return { room: result.recordset[0] };
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error('Create room rollback error:', rollbackError);
      }
    }
    throw error;
  }
}

async function updateRoom({ roomId, roomNumber, roomTypeId, floor }) {
  const pool = await getPool();
  let transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const existingRoom = await new sql.Request(transaction)
      .input('roomId', sql.Int, roomId)
      .query('SELECT id FROM dbo.rooms WITH (UPDLOCK, HOLDLOCK) WHERE id = @roomId;');

    if (!existingRoom.recordset.length) {
      await transaction.rollback();
      transaction = null;
      return { reason: 'ROOM_NOT_FOUND' };
    }

    const roomTypeResult = await new sql.Request(transaction)
      .input('roomTypeId', sql.Int, roomTypeId)
      .query('SELECT id FROM dbo.room_types WITH (UPDLOCK, HOLDLOCK) WHERE id = @roomTypeId;');

    if (!roomTypeResult.recordset.length) {
      await transaction.rollback();
      transaction = null;
      return { reason: 'ROOM_TYPE_NOT_FOUND' };
    }

    const duplicateRoom = await new sql.Request(transaction)
      .input('roomId', sql.Int, roomId)
      .input('roomNumber', sql.VarChar(10), roomNumber)
      .query('SELECT id FROM dbo.rooms WITH (UPDLOCK, HOLDLOCK) WHERE room_number = @roomNumber AND id <> @roomId;');

    if (duplicateRoom.recordset.length) {
      await transaction.rollback();
      transaction = null;
      return { reason: 'ROOM_NUMBER_EXISTS' };
    }

    const result = await new sql.Request(transaction)
      .input('roomId', sql.Int, roomId)
      .input('roomNumber', sql.VarChar(10), roomNumber)
      .input('roomTypeId', sql.Int, roomTypeId)
      .input('floor', sql.TinyInt, floor)
      .query(`
        UPDATE dbo.rooms
        SET room_number = @roomNumber,
            room_type_id = @roomTypeId,
            floor = @floor
        OUTPUT INSERTED.id, INSERTED.room_number, INSERTED.room_type_id,
               INSERTED.floor, INSERTED.status
        WHERE id = @roomId;
      `);

    if (!result.recordset.length) {
      await transaction.rollback();
      transaction = null;
      return { reason: 'ROOM_NOT_FOUND' };
    }

    await transaction.commit();
    transaction = null;
    return { room: result.recordset[0] };
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error('Update room rollback error:', rollbackError);
      }
    }
    throw error;
  }
}

async function deleteRoom(roomId) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    const room = await transaction.request()
      .input('roomId', sql.Int, roomId)
      .query('SELECT id FROM dbo.rooms WITH (UPDLOCK, HOLDLOCK) WHERE id = @roomId;');

    if (!room.recordset.length) {
      await transaction.rollback();
      return { reason: 'ROOM_NOT_FOUND' };
    }

    const foreignKeys = await transaction.request().query(`
      SELECT DISTINCT schema_info.name AS schema_name, table_info.name AS table_name, column_info.name AS column_name
      FROM sys.foreign_keys foreign_key
      INNER JOIN sys.foreign_key_columns foreign_key_column
        ON foreign_key_column.constraint_object_id = foreign_key.object_id
      INNER JOIN sys.tables table_info
        ON table_info.object_id = foreign_key_column.parent_object_id
      INNER JOIN sys.schemas schema_info
        ON schema_info.schema_id = table_info.schema_id
      INNER JOIN sys.columns column_info
        ON column_info.object_id = table_info.object_id
        AND column_info.column_id = foreign_key_column.parent_column_id
      WHERE foreign_key.referenced_object_id = OBJECT_ID(N'dbo.rooms')
        AND foreign_key_column.referenced_column_id = (
          SELECT column_id
          FROM sys.columns
          WHERE object_id = OBJECT_ID(N'dbo.rooms') AND name = N'id'
        );
    `);
    let hasForeignKeyReferences = false;
    for (const foreignKey of foreignKeys.recordset) {
      const schemaName = quoteSqlIdentifier(foreignKey.schema_name);
      const tableName = quoteSqlIdentifier(foreignKey.table_name);
      const columnName = quoteSqlIdentifier(foreignKey.column_name);
      const reference = await transaction.request()
        .input('roomId', sql.Int, roomId)
        .query(`SELECT TOP (1) 1 AS is_referenced FROM ${schemaName}.${tableName} WITH (UPDLOCK, HOLDLOCK) WHERE ${columnName} = @roomId;`);
      if (reference.recordset.length) {
        hasForeignKeyReferences = true;
        break;
      }
    }

    const references = await transaction.request()
      .input('roomId', sql.Int, roomId)
      .query(`
        SELECT
          (SELECT COUNT_BIG(*) FROM dbo.booking_rooms WITH (UPDLOCK, HOLDLOCK) WHERE room_id = @roomId) AS booking_count,
          (SELECT COUNT_BIG(*) FROM dbo.room_problem_reports WITH (UPDLOCK, HOLDLOCK) WHERE room_id = @roomId) AS maintenance_report_count;
      `);
    const referenceCounts = references.recordset[0];
    if (
      hasForeignKeyReferences
      || Number(referenceCounts.booking_count) > 0
      || Number(referenceCounts.maintenance_report_count) > 0
    ) {
      await transaction.rollback();
      return { reason: 'ROOM_REFERENCED' };
    }

    const result = await transaction.request()
      .input('roomId', sql.Int, roomId)
      .query('DELETE FROM dbo.rooms OUTPUT DELETED.id WHERE id = @roomId;');

    if (!result.recordset.length) {
      await transaction.rollback();
      return { reason: 'ROOM_NOT_FOUND' };
    }

    await transaction.commit();
    return { roomId: result.recordset[0].id };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error('Delete room rollback error:', rollbackError);
    }
    throw error;
  }
}

module.exports = {
  checkRoomAvailability,
  getAvailableRoomsForType,
  getRoomList,
  getRoomDetails,
  createRoom,
  updateRoom,
  deleteRoom,
};
