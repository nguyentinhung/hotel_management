const { sql, getPool } = require('../config/db');
const PromotionModel = require('../models/promotionModel');

const selectColumns = `
  id,
  code,
  name,
  description,
  discount_type,
  discount_value,
  max_discount,
  CONVERT(varchar(10), valid_from, 23) AS valid_from,
  CONVERT(varchar(10), valid_to, 23) AS valid_to,
  is_active
`;

const outputColumns = `
  INSERTED.id,
  INSERTED.code,
  INSERTED.name,
  INSERTED.description,
  INSERTED.discount_type,
  INSERTED.discount_value,
  INSERTED.max_discount,
  INSERTED.valid_from,
  INSERTED.valid_to,
  INSERTED.is_active
`;

async function findAll() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT ${selectColumns}
    FROM promotions
    ORDER BY id;
  `);
  return PromotionModel.fromRows(result.recordset);
}

async function findActive() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT ${selectColumns}
    FROM promotions
    WHERE is_active = 1 AND GETDATE() BETWEEN valid_from AND valid_to
    ORDER BY id;
  `);
  return PromotionModel.fromRows(result.recordset);
}

async function findById(id, activeOnly = false) {
  const pool = await getPool();
  const activeClause = activeOnly ? 'AND is_active = 1 AND GETDATE() BETWEEN valid_from AND valid_to' : '';
  const result = await pool.request()
    .input('id', sql.Int, id)
    .query(`
      SELECT ${selectColumns}
      FROM promotions
      WHERE id = @id ${activeClause};
    `);
  return PromotionModel.fromRow(result.recordset[0]);
}

async function findByCode(code, excludedId = null) {
  const pool = await getPool();
  const request = pool.request()
    .input('code', sql.VarChar(50), code);
  const excludedClause = excludedId ? 'AND id <> @excludedId' : '';
  if (excludedId) request.input('excludedId', sql.Int, excludedId);

  const result = await request.query(`
    SELECT TOP (1) id
    FROM promotions
    WHERE UPPER(LTRIM(RTRIM(code))) = UPPER(@code) ${excludedClause};
  `);
  return result.recordset[0] || null;
}

async function findActiveByCode(code) {
  const pool = await getPool();
  const result = await pool.request().input('code', sql.VarChar(50), code).query(`
    SELECT ${selectColumns} FROM promotions
    WHERE UPPER(LTRIM(RTRIM(code))) = UPPER(@code)
      AND is_active = 1 AND CAST(GETDATE() AS date) BETWEEN valid_from AND valid_to;
  `);
  return PromotionModel.fromRow(result.recordset[0]);
}

async function create(promotion) {
  const pool = await getPool();
  const request = pool.request()
    .input('code', sql.VarChar(50), promotion.code)
    .input('name', sql.NVarChar(150), promotion.name)
    .input('description', sql.NVarChar(sql.MAX), promotion.description)
    .input('discount_type', sql.VarChar(20), promotion.discount_type)
    .input('discount_value', sql.Decimal(12, 2), promotion.discount_value)
    .input('valid_from', sql.Date, promotion.valid_from)
    .input('valid_to', sql.Date, promotion.valid_to)
    .input('is_active', sql.Bit, promotion.is_active);
  if (promotion.max_discount == null) {
    request.input('max_discount', null);
  } else {
    request.input('max_discount', sql.Decimal(12, 2), promotion.max_discount);
  }

  const result = await request.query(`
      INSERT INTO promotions
      (
        code,
        name,
        description,
        discount_type,
        discount_value,
        max_discount,
        valid_from,
        valid_to,
        is_active
      )
      OUTPUT ${outputColumns}
      VALUES
      (
        @code,
        @name,
        @description,
        @discount_type,
        @discount_value,
        @max_discount,
        @valid_from,
        @valid_to,
        @is_active
      );
    `);
  return PromotionModel.fromRow(result.recordset[0]);
}

async function update(id, promotion) {
  const pool = await getPool();
  const request = pool.request()
    .input('id', sql.Int, id)
    .input('code', sql.VarChar(50), promotion.code)
    .input('name', sql.NVarChar(150), promotion.name)
    .input('description', sql.NVarChar(sql.MAX), promotion.description)
    .input('discount_type', sql.VarChar(20), promotion.discount_type)
    .input('discount_value', sql.Decimal(12, 2), promotion.discount_value)
    .input('valid_from', sql.Date, promotion.valid_from)
    .input('valid_to', sql.Date, promotion.valid_to)
    .input('is_active', sql.Bit, promotion.is_active);
  if (promotion.max_discount == null) {
    request.input('max_discount', null);
  } else {
    request.input('max_discount', sql.Decimal(12, 2), promotion.max_discount);
  }

  const result = await request.query(`
      UPDATE promotions
      SET
        code = @code,
        name = @name,
        description = @description,
        discount_type = @discount_type,
        discount_value = @discount_value,
        max_discount = @max_discount,
        valid_from = @valid_from,
        valid_to = @valid_to,
        is_active = @is_active
      OUTPUT ${outputColumns}
      WHERE id = @id;
    `);
  return PromotionModel.fromRow(result.recordset[0]);
}

async function remove(id) {
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.Int, id)
    .query('DELETE FROM promotions OUTPUT DELETED.id WHERE id = @id;');
  return result.recordset[0] || null;
}

module.exports = {
  findAll,
  findActive,
  findById,
  findByCode,
  findActiveByCode,
  create,
  update,
  remove
};
