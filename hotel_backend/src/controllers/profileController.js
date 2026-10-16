const sql = require('mssql');
const { getPool } = require('../config/db');

async function updateCustomerProfile(req, res) {
  try {
    const userId = req.auth.userId;
    const fullName =
      typeof req.body.full_name === 'string'
        ? req.body.full_name.trim()
        : '';
    const phone =
      typeof req.body.phone === 'string'
        ? req.body.phone.trim()
        : '';

    if (!fullName || fullName.length > 255) {
      return res.status(400).json({
        message: 'Họ tên không được để trống và tối đa 255 ký tự.',
      });
    }

    if (!/^\+?[0-9\s\-()]{10,10}$/.test(phone)) {
      return res.status(400).json({
        message: 'Số điện thoại không đúng định dạng.',
      });
    }

    const pool = await getPool();

    const result = await pool.request()
      .input('userId', sql.BigInt, userId)
      .input('fullName', sql.NVarChar(255), fullName)
      .input('phone', sql.VarChar(20), phone)
      .query(`
    UPDATE users
    SET full_name = @fullName,
        phone = @phone
    OUTPUT
      INSERTED.id,
      INSERTED.email,
      INSERTED.full_name,
      INSERTED.phone,
      INSERTED.status
    WHERE id = @userId
  AND role_id IN (
    SELECT id
    FROM roles
    WHERE code IN ('CUSTOMER', 'ADMIN', 'RECEPTIONIST', 'HOUSEKEEPER')
  );
  `);

    if (!result.recordset.length) {
      return res.status(404).json({
        message: 'Không tìm thấy tài khoản khách hàng.',
      });
    }

    return res.json({
      message: 'Cập nhật hồ sơ thành công.',
      user: result.recordset[0],
    });

  } catch (error) {
    console.error('Update customer profile error:', error);
    return res.status(500).json({
      message: 'Không thể cập nhật hồ sơ lúc này.',
    });
  }
}

module.exports = { updateCustomerProfile };