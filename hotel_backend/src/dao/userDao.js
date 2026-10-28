const sql = require('mssql');
const { getPool } = require('../config/db');
const UserModel = require('../models/userModel');

const USER_COLUMNS = `u.id, u.full_name, u.email, u.phone, u.status,
  r.code AS role_code, r.name AS role_name`;

async function getUserList(search = '') {
  const pool = await getPool();
  const request = pool.request().input('search', sql.NVarChar(257), `%${search}%`);
  const result = await request.query(`
    SELECT ${USER_COLUMNS}
    FROM dbo.users u LEFT JOIN dbo.roles r ON r.id = u.role_id
    WHERE @search = '%%' OR u.full_name LIKE @search OR u.email LIKE @search OR u.phone LIKE @search
    ORDER BY u.id DESC;
  `);
  return UserModel.fromRows(result.recordset);
}

async function getUserById(id) {
  const pool = await getPool();
  const result = await pool.request().input('id', sql.BigInt, id).query(`
    SELECT ${USER_COLUMNS}
    FROM dbo.users u LEFT JOIN dbo.roles r ON r.id = u.role_id
    WHERE u.id = @id;
  `);
  return UserModel.fromRow(result.recordset[0] ?? null);
}

async function findDuplicate(field, value, exceptId) {
  const pool = await getPool();
  const column = field === 'email' ? 'email' : 'phone';
  const result = await pool.request()
    .input('value', sql.VarChar(254), value)
    .input('id', sql.BigInt, exceptId ?? null)
    .query(`SELECT TOP 1 id FROM dbo.users WHERE ${column} = @value AND (@id IS NULL OR id <> @id);`);
  return result.recordset[0] ?? null;
}

const getUserByEmail = (email) => findDuplicate('email', email);
const getUserByPhone = (phone) => findDuplicate('phone', phone);
const getUserByEmailExceptId = (email, id) => findDuplicate('email', email, id);
const getUserByPhoneExceptId = (phone, id) => findDuplicate('phone', phone, id);

async function createUser({ fullName, email, phone, passwordHash, roleCode }) {
  const pool = await getPool();
  const result = await pool.request()
    .input('fullName', sql.NVarChar(255), fullName)
    .input('email', sql.VarChar(150), email)
    .input('phone', sql.VarChar(20), phone)
    .input('passwordHash', sql.VarChar(255), passwordHash)
    .input('roleCode', sql.VarChar(30), roleCode)
    .query(`
      DECLARE @roleId TINYINT = (SELECT TOP 1 id FROM dbo.roles WHERE UPPER(code) = @roleCode);
      IF @roleId IS NULL THROW 50011, 'Vai trò không tồn tại.', 1;
      INSERT INTO dbo.users (role_id, email, password_hash, full_name, phone, status)
      VALUES (@roleId, @email, @passwordHash, @fullName, @phone, 'ACTIVE');
      DECLARE @userId BIGINT = SCOPE_IDENTITY();
      SELECT ${USER_COLUMNS}
      FROM dbo.users u LEFT JOIN dbo.roles r ON r.id = u.role_id
      WHERE u.id = @userId;
    `);
  return UserModel.fromRow(result.recordset[0] ?? null);
}

async function updateUser(id, { fullName, email, phone }) {
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.BigInt, id)
    .input('fullName', sql.NVarChar(255), fullName)
    .input('email', sql.VarChar(150), email)
    .input('phone', sql.VarChar(20), phone)
    .query(`
      UPDATE dbo.users SET full_name = @fullName, email = @email, phone = @phone WHERE id = @id;
      SELECT ${USER_COLUMNS} FROM dbo.users u LEFT JOIN dbo.roles r ON r.id = u.role_id WHERE u.id = @id;
    `);
  return UserModel.fromRow(result.recordset[0] ?? null);
}

async function setStatus(id, status) {
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.BigInt, id)
    .input('status', sql.VarChar(20), status)
    .query(`UPDATE dbo.users SET status = @status OUTPUT INSERTED.id WHERE id = @id;`);
  return result.recordset.length > 0;
}

const lockUser = (id) => setStatus(id, 'LOCKED');
const unlockUser = (id) => setStatus(id, 'ACTIVE');

async function assignUserRole(id, roleCode) {
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.BigInt, id)
    .input('roleCode', sql.VarChar(30), roleCode)
    .query(`
      UPDATE dbo.users SET role_id = (SELECT id FROM dbo.roles WHERE UPPER(code) = @roleCode)
      OUTPUT INSERTED.id
      WHERE id = @id AND EXISTS (SELECT 1 FROM dbo.roles WHERE UPPER(code) = @roleCode);
    `);
  return result.recordset.length > 0;
}

module.exports = {
  getUserList, getUserById, getUserByEmail, getUserByPhone,
  getUserByEmailExceptId, getUserByPhoneExceptId, createUser, updateUser,
  lockUser, unlockUser, assignUserRole,
};
