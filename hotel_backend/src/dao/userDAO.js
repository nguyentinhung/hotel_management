const { getPool, sql } = require('../config/db');

// Tìm tài khoản theo email
async function findUserByEmail(email) {
    const pool = await getPool();

    const result = await pool.request()
        .input('email', sql.VarChar(150), email)
        .query(`
      SELECT u.id, u.email, u.password_hash, u.full_name,
             u.phone, u.status, u.role_id,
             r.code AS role_code, r.name AS role_name
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE LOWER(u.email) = LOWER(@email);
    `);

    return result.recordset[0] || null;
}

// Lưu refresh token
async function saveRefreshToken(userId, token, expiresAt) {
    const pool = await getPool();

    await pool.request()
        .input('user_id', sql.BigInt, userId)
        .input('token', sql.VarChar(255), token)
        .input('expires_at', sql.DateTimeOffset, expiresAt)
        .query(`
      INSERT INTO refresh_tokens (user_id, token, expires_at)
      VALUES (@user_id, @token, @expires_at);
    `);
}

async function revokeRefreshToken(token) {
    const pool = await getPool();

    await pool.request()
        .input('token', sql.VarChar(255), String(token))
        .query(`
            UPDATE refresh_tokens
            SET revoked_at = SYSUTCDATETIME()
            WHERE token = @token AND revoked_at IS NULL;
        `);
}

module.exports = {
    findUserByEmail,
    saveRefreshToken,
    revokeRefreshToken,
};