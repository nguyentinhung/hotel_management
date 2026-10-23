
const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const userDao = require('../dao/userDao');

async function getUserList() {
    return userDao.getUserList();
}

async function getUserById(id) {
    return userDao.getUserById(id);
}

async function createUser(data) {
    const fullName = String(data.full_name || '').trim();
    const email = userModel.normalizeEmail(data.email);
    const phone = userModel.normalizePhone(data.phone);
    const password = String(data.password || '');
    const roleCode = String(data.role_code || '').trim().toUpperCase();

    if (!fullName || !email || !phone || !password || !roleCode) {
        const error = new Error('Vui lòng nhập đầy đủ thông tin.');
        error.statusCode = 400;
        throw error;
    }

    if (!userModel.isValidEmail(email)) {
        const error = new Error('Email không đúng định dạng.');
        error.statusCode = 400;
        throw error;
    }

    if (!userModel.isValidPhone(phone)) {
        const error = new Error('Số điện thoại không đúng định dạng.');
        error.statusCode = 400;
        throw error;
    }

    const passwordRegex =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s])\S{8,}$/;

    if (!passwordRegex.test(password)) {
        const error = new Error(
            'Mật khẩu phải có ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường, số và ký tự đặc biệt.'
        );
        error.statusCode = 400;
        throw error;
    }

    const allowedRoles = [
        'ADMIN',
        'RECEPTIONIST',
        'HOUSEKEEPER',
        'CUSTOMER',
    ];

    if (!allowedRoles.includes(roleCode)) {
        const error = new Error('Vai trò không hợp lệ.');
        error.statusCode = 400;
        throw error;
    }

    const existingEmail = await userDao.getUserByEmail(email);

    if (existingEmail) {
        const error = new Error('Email đã tồn tại trong hệ thống.');
        error.statusCode = 409;
        throw error;
    }

    const existingPhone = await userDao.getUserByPhone(phone);

    if (existingPhone) {
        const error = new Error('Số điện thoại đã được sử dụng.');
        error.statusCode = 409;
        throw error;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    return userDao.createUser({
        fullName,
        email,
        phone,
        passwordHash,
        roleCode,
    });
}

module.exports = {
    getUserList,
    getUserById,
    createUser,
};
