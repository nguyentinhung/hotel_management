const sql = require('mssql');
const { getPool } = require('../config/db');
const ProfileModel = require('../models/profileModel');

async function getProfileByUserId(userId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('userId', sql.BigInt, userId)
    .query(`
      SELECT u.id, u.email, u.full_name, u.phone, u.status,
             r.code AS role_code, r.name AS role_name
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id = @userId;
    `);
  return ProfileModel.fromRow(result.recordset[0]);
}

async function updateProfileByUserId(userId, fullName, phone) {
  const pool = await getPool();
  await pool.request()
    .input('userId', sql.BigInt, userId)
    .input('fullName', sql.NVarChar(255), fullName)
    .input('phone', sql.VarChar(20), phone)
    .query('UPDATE users SET full_name = @fullName, phone = @phone WHERE id = @userId;');
  return getProfileByUserId(userId);
}

module.exports = { getProfileByUserId, updateProfileByUserId };
