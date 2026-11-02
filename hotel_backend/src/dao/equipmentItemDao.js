const { getPool, sql } = require('../config/db');

async function findAll() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT item.id, item.name, item.description, item.is_active, item.unit_price,
      CAST(COUNT(asset.id) AS INT) AS asset_count
    FROM dbo.equipment_items AS item
    LEFT JOIN dbo.equipment_assets AS asset ON asset.equipment_item_id = item.id
    GROUP BY item.id, item.name, item.description, item.is_active, item.unit_price
    ORDER BY item.id;
  `);
  return result.recordset;
}

async function findById(id) {
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.Int, id)
    .query(`SELECT item.id, item.name, item.description, item.is_active, item.unit_price,
      (SELECT COUNT(*) FROM dbo.equipment_assets AS asset WHERE asset.equipment_item_id = item.id) AS asset_count
      FROM dbo.equipment_items AS item WHERE item.id = @id;`);
  return (result.recordset[0] ?? null);
}

async function create(equipmentItem) {
  const pool = await getPool();
  const result = await pool.request()
    .input('name', sql.NVarChar(100), equipmentItem.name)
    .input('description', sql.NVarChar(500), equipmentItem.description ?? null)
    .input('is_active', sql.Bit, equipmentItem.is_active)
    .input('unit_price', sql.Decimal(12, 2), equipmentItem.unit_price)
    .query(`
      INSERT INTO dbo.equipment_items (name, description, is_active, unit_price)
      OUTPUT INSERTED.id, INSERTED.name, INSERTED.description, INSERTED.is_active, INSERTED.unit_price,
        0 AS asset_count
      VALUES (@name, @description, @is_active, @unit_price);
    `);
  return (result.recordset[0] ?? null);
}

async function update(id, equipmentItem) {
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.Int, id)
    .input('name', sql.NVarChar(100), equipmentItem.name)
    .input('descriptionProvided', sql.Bit, Object.hasOwn(equipmentItem, 'description'))
    .input('description', sql.NVarChar(500), equipmentItem.description ?? null)
    .input('is_active', sql.Bit, equipmentItem.is_active)
    .input('unit_price', sql.Decimal(12, 2), equipmentItem.unit_price)
    .query(`
      UPDATE dbo.equipment_items
      SET name = @name, is_active = @is_active, unit_price = @unit_price,
          description = CASE WHEN @descriptionProvided = 1 THEN @description ELSE description END
      WHERE id = @id;

      SELECT item.id, item.name, item.description, item.is_active, item.unit_price,
        (SELECT COUNT(*) FROM dbo.equipment_assets AS asset WHERE asset.equipment_item_id = item.id) AS asset_count
      FROM dbo.equipment_items AS item WHERE item.id = @id;
    `);
  return (result.recordset[0] ?? null);
}

async function deleteById(id) {
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.Int, id)
    .query(`
      DELETE FROM dbo.equipment_items
      OUTPUT DELETED.id
      WHERE id = @id;
    `);
  return result.recordset[0]?.id ?? null;
}

async function findRoomsForEquipment(id) {
  const pool = await getPool();
  const result = await pool.request()
    .input('equipmentItemId', sql.Int, id)
    .query(`
      SELECT r.id, r.room_number, r.floor, r.status,
        CAST(CASE WHEN assignment.room_id IS NULL THEN 0 ELSE 1 END AS BIT) AS is_assigned
      FROM dbo.rooms r
      LEFT JOIN dbo.room_equipment_assignments assignment
        ON assignment.room_id = r.id AND assignment.equipment_item_id = @equipmentItemId
      WHERE r.status = 'AVAILABLE'
      ORDER BY r.floor, r.room_number;
    `);
  return result.recordset;
}

async function replaceRoomAssignments(id, roomIds) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const equipment = await transaction.request()
      .input('equipmentItemId', sql.Int, id)
      .query('SELECT id FROM dbo.equipment_items WITH (UPDLOCK, HOLDLOCK) WHERE id = @equipmentItemId;');
    if (!equipment.recordset.length) {
      await transaction.rollback();
      return false;
    }

    if (roomIds.length) {
      const roomRequest = transaction.request();
      const roomParameterNames = roomIds.map((roomId, index) => {
        const parameter = `roomId${index}`;
        roomRequest.input(parameter, sql.Int, roomId);
        return `@${parameter}`;
      });
      const rooms = await roomRequest.query(`SELECT id FROM dbo.rooms WITH (UPDLOCK, HOLDLOCK) WHERE status = 'AVAILABLE' AND id IN (${roomParameterNames.join(', ')});`);
      if (rooms.recordset.length !== roomIds.length) {
        const error = new Error('Chỉ có thể gán thiết bị cho phòng đang trống. Hãy tải lại danh sách phòng.');
        error.statusCode = 409;
        throw error;
      }
    }

    await transaction.request()
      .input('equipmentItemId', sql.Int, id)
      .query('DELETE FROM dbo.room_equipment_assignments WHERE equipment_item_id = @equipmentItemId;');

    for (const roomId of roomIds) {
      await transaction.request()
        .input('equipmentItemId', sql.Int, id)
        .input('roomId', sql.Int, roomId)
        .query('INSERT INTO dbo.room_equipment_assignments (equipment_item_id, room_id) VALUES (@equipmentItemId, @roomId);');
    }
    await transaction.commit();
    return true;
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }
}

module.exports = { findAll, findById, create, update, deleteById, findRoomsForEquipment, replaceRoomAssignments };
