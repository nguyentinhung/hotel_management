const sql = require('mssql');
const { getPool } = require('../config/db');
const StaffModel = require('../models/staffModel');

const staffSelect = `
  SELECT s.id, s.user_id, s.staff_code, s.gender, s.date_of_birth, s.address,
         s.position, s.hire_date, s.employment_status, s.created_at, s.updated_at,
         u.email, u.full_name, u.phone
  FROM dbo.staff s
  INNER JOIN dbo.users u ON u.id = s.user_id`;

async function findAll(search = '') {
  const pool = await getPool();
  const request = pool.request();
  request.input('search', sql.NVarChar(200), `%${search}%`);
  const result = await request.query(`${staffSelect}
    WHERE (@search = '%%' OR s.staff_code LIKE @search OR u.full_name LIKE @search OR u.email LIKE @search OR u.phone LIKE @search OR s.position LIKE @search)
    ORDER BY s.staff_code;`);
  return StaffModel.fromRows(result.recordset);
}

async function findById(id) {
  const pool = await getPool();
  const result = await pool.request().input('id', sql.BigInt, id).query(`${staffSelect} WHERE s.id = @id;`);
  return StaffModel.fromRow(result.recordset[0]);
}

async function updateInfo(id, data) {
  const pool = await getPool();
  const request = pool.request()
    .input('id', sql.BigInt, id)
    .input('fullName', sql.NVarChar(255), data.full_name)
    .input('email', sql.VarChar(150), data.email)
    .input('phone', sql.VarChar(20), data.phone || null)
    .input('gender', sql.NVarChar(20), data.gender || null)
    .input('dateOfBirth', sql.Date, data.date_of_birth || null)
    .input('address', sql.NVarChar(500), data.address || null)
    .input('position', sql.NVarChar(100), data.position || null)
    .input('hireDate', sql.Date, data.hire_date || null);
  await request.query(`
    BEGIN TRY
      BEGIN TRANSACTION;
      UPDATE u SET full_name = @fullName, email = @email, phone = @phone
      FROM dbo.users u INNER JOIN dbo.staff s ON s.user_id = u.id WHERE s.id = @id;
      UPDATE dbo.staff SET gender = @gender, date_of_birth = @dateOfBirth, address = @address,
        position = @position, hire_date = @hireDate, updated_at = SYSDATETIME()
      WHERE id = @id;
      COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
      IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
      THROW;
    END CATCH;
  `);
  return findById(id);
}

async function updateStatus(id, status) {
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.BigInt, id)
    .input('status', sql.VarChar(30), status)
    .query(`UPDATE dbo.staff SET employment_status = @status, updated_at = SYSDATETIME() WHERE id = @id; SELECT @@ROWCOUNT AS affected;`);
  return result.recordset[0]?.affected > 0;
}

async function emailExists(email, exceptId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('email', sql.VarChar(150), email)
    .input('id', sql.BigInt, exceptId)
    .query('SELECT TOP 1 u.id FROM dbo.users u WHERE u.email = @email AND u.id <> (SELECT user_id FROM dbo.staff WHERE id = @id);');
  return result.recordset.length > 0;
}

module.exports = { findAll, findById, updateInfo, updateStatus, emailExists };
