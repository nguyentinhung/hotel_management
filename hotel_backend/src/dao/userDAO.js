const { getPool } = require('../config/db');
const UserModel = require('../models/userModel');
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
  return result.recordset.map((user) => UserModel.fromRow(user));
}

module.exports = {
  getUserList,
};