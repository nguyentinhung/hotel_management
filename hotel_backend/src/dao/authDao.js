const { sql, getPool } = require('../config/db');
const UserModel = require('../models/userModel');

async function findUserIdByEmail(email) {
  const pool = await getPool();
  const result = await pool.request().input('email', sql.VarChar(150), email)
    .query('SELECT TOP 1 id FROM users WHERE LOWER(email) = LOWER(@email);');
  return result.recordset[0] || null;
}

async function findUserIdByPhone(phone) {
  const pool = await getPool();
  const result = await pool.request().input('phone', sql.VarChar(20), phone)
    .query('SELECT TOP 1 id FROM users WHERE phone = @phone;');
  return result.recordset[0] || null;
}

async function getCustomerRole() {
  const pool = await getPool();
  const result = await pool.request().query("SELECT TOP 1 id, code, name FROM roles WHERE code = 'CUSTOMER';");
  return result.recordset[0] || null;
}

async function createUser({ roleId, email, passwordHash, fullName, phone }) {
  const pool = await getPool();
  const result = await pool.request()
    .input('role_id', sql.TinyInt, roleId)
    .input('email', sql.VarChar(150), email)
    .input('password_hash', sql.VarChar(255), passwordHash)
    .input('full_name', sql.NVarChar(255), fullName)
    .input('phone', sql.VarChar(20), phone)
    .input('status', sql.VarChar(20), 'LOCKED')
    .query(`
      INSERT INTO users (role_id, email, password_hash, full_name, phone, status)
      OUTPUT INSERTED.*
      VALUES (@role_id, @email, @password_hash, @full_name, @phone, @status);
    `);
  return UserModel.fromRow(result.recordset[0]);
}

async function createEmailVerification(userId, token, expiresAt) {
  const pool = await getPool();
  await pool.request()
    .input('user_id', sql.BigInt, userId)
    .input('token', sql.VarChar(255), token)
    .input('expires_at', sql.DateTimeOffset, expiresAt)
    .query(`INSERT INTO email_verifications (user_id, token, expires_at, type)
      VALUES (@user_id, @token, @expires_at, 'email_verification');`);
}

async function cleanupPendingRegistration(userId, token) {
  const pool = await getPool();
  await pool.request()
    .input('token', sql.VarChar(255), token)
    .input('userId', sql.BigInt, userId)
    .query(`DELETE FROM email_verifications WHERE token = @token;
      DELETE FROM users WHERE id = @userId AND status = 'LOCKED';`);
}

async function getValidEmailVerification(token) {
  const pool = await getPool();
  const result = await pool.request().input('token', sql.VarChar(255), token).query(`
    SELECT TOP 1 * FROM email_verifications
    WHERE token = @token AND used_at IS NULL AND expires_at > SYSUTCDATETIME();
  `);
  return result.recordset[0] || null;
}

async function activateVerifiedUser(userId, token) {
  const pool = await getPool();
  await pool.request().input('user_id', sql.BigInt, userId)
    .query("UPDATE users SET status = 'ACTIVE' WHERE id = @user_id;");
  await pool.request().input('token', sql.VarChar(255), token)
    .query('UPDATE email_verifications SET used_at = SYSUTCDATETIME() WHERE token = @token;');
}

async function getUserByEmail(email) {
  const pool = await getPool();
  const result = await pool.request().input('email', sql.VarChar(150), email).query(`
    SELECT u.id, u.email, u.password_hash, u.full_name, u.phone, u.status, u.role_id,
           r.code AS role_code, r.name AS role_name
    FROM users u LEFT JOIN roles r ON r.id = u.role_id
    WHERE LOWER(u.email) = LOWER(@email);
  `);
  return UserModel.fromRow(result.recordset[0]);
}

async function createRefreshToken(userId, token, expiresAt) {
  const pool = await getPool();
  await pool.request().input('user_id', sql.BigInt, userId)
    .input('token', sql.VarChar(255), token)
    .input('expires_at', sql.DateTimeOffset, expiresAt)
    .query('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (@user_id, @token, @expires_at);');
}

async function revokeRefreshToken(token) {
  const pool = await getPool();
  await pool.request().input('token', sql.VarChar(255), token)
    .query('UPDATE refresh_tokens SET revoked_at = SYSUTCDATETIME() WHERE token = @token AND revoked_at IS NULL;');
}

async function getActiveUserByEmail(email) {
  const pool = await getPool();
  const result = await pool.request().input('email', sql.VarChar(150), email).query(`
    SELECT TOP 1 id, email, full_name, status FROM users
    WHERE email = @email AND status = 'ACTIVE';
  `);
  return UserModel.fromRow(result.recordset[0]);
}

async function invalidateUnusedPasswordResets(userId) {
  const pool = await getPool();
  await pool.request().input('userId', sql.BigInt, userId).query(`
    UPDATE password_resets SET is_used = 1 WHERE user_id = @userId AND is_used = 0;
  `);
}

async function createPasswordResetOtp(userId, otpCode) {
  const pool = await getPool();
  const result = await pool.request()
    .input('userId', sql.BigInt, userId)
    .input('otpCode', sql.VarChar(10), otpCode)
    .query(`
      INSERT INTO password_resets (user_id, otp_code, token, expires_at, is_used, created_at)
      OUTPUT INSERTED.id
      VALUES (@userId, @otpCode, NULL, DATEADD(MINUTE, 10, SYSDATETIME()), 0, SYSDATETIME());
    `);
  return result.recordset[0]?.id;
}

async function markPasswordResetUsed(resetId) {
  const pool = await getPool();
  await pool.request().input('resetId', sql.BigInt, resetId)
    .query('UPDATE password_resets SET is_used = 1 WHERE id = @resetId;');
}

async function getActiveUserIdByEmail(email) {
  const pool = await getPool();
  const result = await pool.request().input('email', sql.VarChar(150), email).query(`
    SELECT TOP 1 id FROM users WHERE email = @email AND status = 'ACTIVE';
  `);
  return result.recordset[0]?.id ?? null;
}

async function getLatestValidPasswordReset(userId, otp) {
  const pool = await getPool();
  const result = await pool.request()
    .input('userId', sql.BigInt, userId)
    .input('otp', sql.VarChar(10), otp)
    .query(`
      SELECT TOP 1 id, expires_at, is_used FROM password_resets
      WHERE user_id = @userId AND otp_code = @otp AND is_used = 0 AND expires_at > SYSDATETIME()
      ORDER BY created_at DESC;
    `);
  return result.recordset[0] || null;
}

async function updatePassword(userId, passwordHash) {
  const pool = await getPool();
  await pool.request().input('userId', sql.BigInt, userId)
    .input('passwordHash', sql.VarChar(255), passwordHash)
    .query('UPDATE users SET password_hash = @passwordHash WHERE id = @userId;');
}

async function getPasswordState(userId) {
  const pool = await getPool();
  const result = await pool.request().input('userId', sql.BigInt, userId)
    .query('SELECT password_hash, status FROM users WHERE id = @userId;');
  return result.recordset[0] || null;
}

async function markPasswordResetsUsedForUser(userId) {
  const pool = await getPool();
  await pool.request().input('userId', sql.BigInt, userId).query(`
    UPDATE password_resets SET is_used = 1 WHERE user_id = @userId AND is_used = 0;
  `);
}

module.exports = {
  findUserIdByEmail, findUserIdByPhone, getCustomerRole, createUser, createEmailVerification,
  cleanupPendingRegistration, getValidEmailVerification, activateVerifiedUser,
  getUserByEmail, createRefreshToken, revokeRefreshToken, getActiveUserByEmail,
  invalidateUnusedPasswordResets, createPasswordResetOtp, markPasswordResetUsed,
  getActiveUserIdByEmail, getLatestValidPasswordReset, updatePassword,
  getPasswordState, markPasswordResetsUsedForUser,
};
