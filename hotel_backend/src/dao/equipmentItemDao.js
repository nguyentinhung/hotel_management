const { getPool, sql } = require('../config/db');
const EquipmentItemModel = require('../models/equipmentItemModel');

async function findAll() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT id, name, description, is_active
    FROM dbo.equipment_items
    ORDER BY id;
  `);
  return EquipmentItemModel.fromRows(result.recordset);
}

async function findById(id) {
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.Int, id)
    .query('SELECT id, name, description, is_active FROM dbo.equipment_items WHERE id = @id;');
  return EquipmentItemModel.fromRow(result.recordset[0]);
}

async function create(equipmentItem) {
  const pool = await getPool();
  const result = await pool.request()
    .input('name', sql.NVarChar(100), equipmentItem.name)
    .input('description', sql.NVarChar(500), equipmentItem.description ?? null)
    .input('is_active', sql.Bit, equipmentItem.is_active)
    .query(`
      INSERT INTO dbo.equipment_items (name, description, is_active)
      OUTPUT INSERTED.id, INSERTED.name, INSERTED.description, INSERTED.is_active
      VALUES (@name, @description, @is_active);
    `);
  return EquipmentItemModel.fromRow(result.recordset[0]);
}

async function update(id, equipmentItem) {
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.Int, id)
    .input('name', sql.NVarChar(100), equipmentItem.name)
    .input('descriptionProvided', sql.Bit, Object.prototype.hasOwnProperty.call(equipmentItem, 'description'))
    .input('description', sql.NVarChar(500), equipmentItem.description ?? null)
    .input('is_active', sql.Bit, equipmentItem.is_active)
    .query(`
      UPDATE dbo.equipment_items
      SET name = @name,
          is_active = @is_active,
          description = CASE WHEN @descriptionProvided = 1 THEN @description ELSE description END
      OUTPUT INSERTED.id, INSERTED.name, INSERTED.description, INSERTED.is_active
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

module.exports = { findAll, findById, create, update, deleteById };
