const { getPool, sql } = require('../config/db');
const EquipmentItemModel = require('../models/equipmentItemModel');

async function findAll() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT id, name, is_active
    FROM dbo.equipment_items
    ORDER BY id;
  `);
  return EquipmentItemModel.fromRows(result.recordset);
}

async function findById(id) {
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.Int, id)
    .query('SELECT id, name, is_active FROM dbo.equipment_items WHERE id = @id;');
  return EquipmentItemModel.fromRow(result.recordset[0]);
}

async function create(equipmentItem) {
  const pool = await getPool();
  const result = await pool.request()
    .input('name', sql.NVarChar(100), equipmentItem.name)
    .input('is_active', sql.Bit, equipmentItem.is_active)
    .query(`
      INSERT INTO dbo.equipment_items (name, is_active)
      OUTPUT INSERTED.id, INSERTED.name, INSERTED.is_active
      VALUES (@name, @is_active);
    `);
  return EquipmentItemModel.fromRow(result.recordset[0]);
}

async function update(id, equipmentItem) {
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.Int, id)
    .input('name', sql.NVarChar(100), equipmentItem.name)
    .input('is_active', sql.Bit, equipmentItem.is_active)
    .query(`
      UPDATE dbo.equipment_items
      SET name = @name, is_active = @is_active
      OUTPUT INSERTED.id, INSERTED.name, INSERTED.is_active
      WHERE id = @id;
    `);
  return EquipmentItemModel.fromRow(result.recordset[0]);
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
      const rooms = await roomRequest.query(`SELECT id FROM dbo.rooms WITH (UPDLOCK, HOLDLOCK) WHERE id IN (${roomParameterNames.join(', ')});`);
      if (rooms.recordset.length !== roomIds.length) {
        const error = new Error('One or more selected rooms no longer exist.');
        error.statusCode = 400;
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
