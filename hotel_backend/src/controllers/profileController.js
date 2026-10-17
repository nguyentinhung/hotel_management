const sql = require('mssql');
const { getPool } = require('../config/db');

async function getProfile(req, res) {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('userId', sql.BigInt, req.auth.userId)
      .query(`
        SELECT u.id, u.email, u.full_name, u.phone, u.status,
               r.code AS role_code, r.name AS role_name
        FROM users u
        LEFT JOIN roles r ON r.id = u.role_id
        WHERE u.id = @userId;
      `);
    if (!result.recordset.length) return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
    return res.json({ user: result.recordset[0] });
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({ message: 'Không thể tải hồ sơ lúc này.' });
  }
}

async function updateProfile(req, res) {
  try {
    const fullName = typeof req.body?.full_name === 'string' ? req.body.full_name.trim() : '';
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
    if (!fullName || fullName.length > 255) {
      return res.status(400).json({ message: 'Họ tên không được để trống và tối đa 255 ký tự.' });
    }
    if (!/^\+?[0-9\s\-()]{9,20}$/.test(phone) || phone.replace(/\D/g, '').length < 9) {
      return res.status(400).json({ message: 'Số điện thoại không đúng định dạng.' });
    }

    const pool = await getPool();
    await pool.request()
      .input('userId', sql.BigInt, req.auth.userId)
      .input('fullName', sql.NVarChar(255), fullName)
      .input('phone', sql.VarChar(20), phone)
      .query('UPDATE users SET full_name = @fullName, phone = @phone WHERE id = @userId;');
    const updated = await pool.request()
      .input('userId', sql.BigInt, req.auth.userId)
      .query(`
        SELECT u.id, u.email, u.full_name, u.phone, u.status,
               r.code AS role_code, r.name AS role_name
        FROM users u
        LEFT JOIN roles r ON r.id = u.role_id
        WHERE u.id = @userId;
      `);
    return res.json({ message: 'Cập nhật hồ sơ thành công.', user: updated.recordset[0] });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ message: 'Không thể cập nhật hồ sơ lúc này.' });
  }
}

module.exports = { getProfile, updateProfile };
