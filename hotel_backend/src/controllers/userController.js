const userService = require('../services/userService');

async function getUserList(req, res) {
    try {
        const users = await userService.getUserList();

        return res.json({
            users,
        });
    } catch (error) {
        console.error('Get user list error:', error);

        return res.status(500).json({
            message: 'Không thể tải danh sách người dùng lúc này.',
        });
    }
}

async function getUserDetails(req, res) {
    try {
        const id = Number(req.params.id);

        if (!Number.isSafeInteger(id) || id <= 0) {
            return res.status(400).json({
                message: 'ID người dùng không hợp lệ.',
            });
        }

        const user = await userService.getUserById(id);

        if (!user) {
            return res.status(404).json({
                message: 'Không tìm thấy người dùng.',
            });
        }

        return res.json({ user });
    } catch (error) {
        console.error('Get user details error:', error);

        return res.status(500).json({
            message: 'Không thể tải chi tiết người dùng.',
        });
    }
}

async function createUser(req, res) {
    try {
        const user = await userService.createUser(req.body || {});

        return res.status(201).json({
            message: 'Tạo tài khoản thành công.',
            user,
        });
    } catch (error) {
        console.error('Create user error:', error);

        return res.status(error.statusCode || 500).json({
            message: error.statusCode
                ? error.message
                : 'Không thể tạo tài khoản người dùng.',
        });
    }
}

module.exports = {
    getUserList,
    getUserDetails,
    createUser,
};