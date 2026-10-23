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
    ORDER BY u.id ASC;
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

async function getUserByEmail(email) {
  const pool = await getPool();

  const result = await pool.request()
    .input('email', sql.NVarChar, email)
    .query(`
            SELECT TOP 1 id
            FROM users
            WHERE LOWER(email) = LOWER(@email);
        `);

  return result.recordset[0] || null;
}

async function getUserByPhone(phone) {
  const pool = await getPool();

  const result = await pool.request()
    .input('phone', sql.NVarChar, phone)
    .query(`
            SELECT TOP 1 id
            FROM users
            WHERE phone = @phone;
        `);

  return result.recordset[0] || null;
}

async function createUser({
  fullName,
  email,
  phone,
  passwordHash,
  roleCode,
}) {
  const pool = await getPool();

  const result = await pool.request()
    .input('fullName', sql.NVarChar, fullName)
    .input('email', sql.NVarChar, email)
    .input('phone', sql.NVarChar, phone)
    .input('passwordHash', sql.NVarChar, passwordHash)
    .input('roleCode', sql.NVarChar, roleCode)
    .query(`
            DECLARE @roleId INT;

            SELECT @roleId = id
            FROM roles
            WHERE UPPER(code) = UPPER(@roleCode);

            IF @roleId IS NULL
                THROW 50001, 'Vai trò không tồn tại.', 1;

            INSERT INTO users (
                role_id,
                email,
                password_hash,
                full_name,
                phone,
                status
            )
            OUTPUT
                INSERTED.id,
                INSERTED.full_name,
                INSERTED.email,
                INSERTED.phone,
                INSERTED.status,
                INSERTED.role_id
            VALUES (
                @roleId,
                @email,
                @passwordHash,
                @fullName,
                @phone,
                'ACTIVE'
            );
        `);

  return userModel.fromRow(result.recordset[0] ?? null);
}

module.exports = {
  getUserList,
  getUserById,
  getUserByEmail,
  getUserByPhone,
  createUser,
};