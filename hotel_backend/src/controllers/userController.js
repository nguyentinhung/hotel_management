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

async function updateUser(req, res) {
    try {
        const user = await userService.updateUser(
            req.params.id,
            req.body || {}
        );

        return res.status(200).json({
            message: 'Cập nhật người dùng thành công.',
            user,
        });
    } catch (error) {
        console.error('updateUser error:', error);

        return res.status(error.statusCode || 500).json({
            message: error.statusCode
                ? error.message
                : 'Lỗi máy chủ khi cập nhật người dùng.',
        });
    }
}

const lockUser = async (req, res) => {
    try {
        const user = await userService.lockUser(req.params.id);

        return res.status(200).json({
            message: 'Khóa tài khoản thành công.',
            user,
        });
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            message: error.message || 'Không thể khóa tài khoản.',
        });
    }
};

const unlockUser = async (req, res) => {
    try {
        const user = await userService.unlockUser(req.params.id);

        return res.status(200).json({
            message: 'Mở khóa tài khoản thành công.',
            user,
        });
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            message: error.message || 'Không thể mở khóa tài khoản.',
        });
    }
};

const assignUserRole = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { role_code } = req.body;

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                message: 'ID người dùng không hợp lệ.',
            });
        }

        if (!role_code) {
            return res.status(400).json({
                message: 'Vui lòng chọn vai trò.',
            });
        }

        const user = await userService.assignUserRole(id, role_code);

        return res.status(200).json({
            message: 'Phân quyền người dùng thành công.',
            user,
        });
    } catch (error) {
        return res.status(400).json({
            message: error.message || 'Không thể phân quyền người dùng.',
        });
    }
};

module.exports = {
    getUserList,
    getUserDetails,
    createUser,
    updateUser,
    lockUser,
    unlockUser,
    assignUserRole,
};