
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

async function updateUser(id, data) {
    const userId = Number(id);

    if (!Number.isInteger(userId) || userId <= 0) {
        const error = new Error('ID người dùng không hợp lệ.');
        error.statusCode = 400;
        throw error;
    }

    const fullName = String(data.full_name || '').trim();
    const email = userModel.normalizeEmail(data.email);
    const phone = userModel.normalizePhone(data.phone);

    if (!fullName || !email || !phone) {
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

    const user = await userDao.getUserById(userId);

    if (!user) {
        const error = new Error('Không tìm thấy người dùng.');
        error.statusCode = 404;
        throw error;
    }

    const existingEmail =
        await userDao.getUserByEmailExceptId(email, userId);

    if (existingEmail) {
        const error = new Error('Email đã được tài khoản khác sử dụng.');
        error.statusCode = 409;
        throw error;
    }

    const existingPhone =
        await userDao.getUserByPhoneExceptId(phone, userId);

    if (existingPhone) {
        const error = new Error(
            'Số điện thoại đã được tài khoản khác sử dụng.'
        );
        error.statusCode = 409;
        throw error;
    }

    return userDao.updateUser(userId, {
        fullName,
        email,
        phone,
    });
}

const lockUser = async (id) => {
    const userId = Number(id);

    if (!Number.isInteger(userId) || userId <= 0) {
        const error = new Error('ID người dùng không hợp lệ.');
        error.statusCode = 400;
        throw error;
    }

    const existingUser = await userDao.getUserById(userId);

    if (!existingUser) {
        const error = new Error('Không tìm thấy người dùng.');
        error.statusCode = 404;
        throw error;
    }

    if (existingUser.status === 'LOCKED') {
        const error = new Error('Tài khoản đã bị khóa.');
        error.statusCode = 400;
        throw error;
    }

    const updated = await userDao.lockUser(userId);

    if (!updated) {
        const error = new Error('Không thể khóa tài khoản.');
        error.statusCode = 500;
        throw error;
    }

    return { id: userId, status: 'LOCKED' };
};

const unlockUser = async (id) => {
    const userId = Number(id);

    if (!Number.isInteger(userId) || userId <= 0) {
        const error = new Error('ID người dùng không hợp lệ.');
        error.statusCode = 400;
        throw error;
    }

    const existingUser = await userDao.getUserById(userId);

    if (!existingUser) {
        const error = new Error('Không tìm thấy người dùng.');
        error.statusCode = 404;
        throw error;
    }

    if (existingUser.status === 'ACTIVE') {
        const error = new Error('Tài khoản đang hoạt động.');
        error.statusCode = 400;
        throw error;
    }

    const updated = await userDao.unlockUser(userId);

    if (!updated) {
        const error = new Error('Không thể mở khóa tài khoản.');
        error.statusCode = 500;
        throw error;
    }

    return { id: userId, status: 'ACTIVE' };
};

async function assignUserRole(id, roleCode) {
    const allowedRoles = [
        'ADMIN',
        'RECEPTIONIST',
        'HOUSEKEEPER',
        'CUSTOMER',
    ];

    if (!allowedRoles.includes(String(roleCode).toUpperCase())) {
        throw new Error('Vai trò không hợp lệ.');
    }

    const updated = await userDao.assignUserRole(
        id,
        String(roleCode).toUpperCase()
    );

    if (!updated) {
        throw new Error('Không tìm thấy người dùng hoặc vai trò.');
    }

    return userDao.getUserById(id);
}

module.exports = {
    getUserList,
    getUserById,
    createUser,
    updateUser,
    lockUser,
    unlockUser,
    assignUserRole,
};
