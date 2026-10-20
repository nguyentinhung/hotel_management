const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const userDAO = require('../dao/userDAO');

// Xử lý đăng nhập
async function login(email, password) {
    const user = await userDAO.findUserByEmail(email);

    if (!user) {
        return {
            status: 401,
            message: 'Email hoặc mật khẩu không chính xác.',
        };
    }

    const legacyPasswordMatch = user.password_hash === password;

    const isMatch = legacyPasswordMatch ||
        await bcrypt.compare(password, user.password_hash).catch(() => false);

    if (!isMatch) {
        return {
            status: 401,
            message: 'Email hoặc mật khẩu không chính xác.',
        };
    }

    if (String(user.status).toUpperCase() !== 'ACTIVE') {
        return {
            status: 403,
            message: 'Tài khoản đang chờ xác thực hoặc đã bị khóa.',
        };
    }

    const refreshToken = crypto.randomBytes(32).toString('hex');
    const refreshExpiresAt = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
    );

    await userDAO.saveRefreshToken(
        user.id,
        refreshToken,
        refreshExpiresAt
    );

    return {
        user,
        refreshToken,
    };
}

async function logout(token) {
    if (!token) {
        return;
    }

    await userDAO.revokeRefreshToken(token);
}

module.exports = { login, logout };