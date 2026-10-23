const sql = require('mssql');
const { getPool } = require('../config/db');
const userModel = require('../models/userModel');

async function getUserList() {
  const pool = await getPool();

  const result = await pool.request().query(`
    SELECT
      u.id,
      u.full_name,
      u.email,
      u.phone,
      u.status,
      r.code AS role_code,
      r.name AS role_name
    FROM users u
    LEFT JOIN roles r ON r.id = u.role_id
    ORDER BY u.id DESC;
  `);

  return userModel.fromRows(result.recordset);
}

async function getUserById(id) {
  const pool = await getPool();

  const result = await pool.request()
    .input('id', sql.Int, id)
    .query(`
      SELECT
        u.id,
        u.full_name,
        u.email,
        u.phone,
        u.status,
        r.code AS role_code,
        r.name AS role_name
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id = @id;
    `);

  return userModel.fromRow(result.recordset[0] ?? null);
}

module.exports = {
  getUserList,
  getUserById,
};