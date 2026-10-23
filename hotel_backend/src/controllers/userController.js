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

module.exports = {
    getUserList,
};