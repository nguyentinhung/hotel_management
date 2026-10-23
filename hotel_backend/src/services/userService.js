const userDao = require('../dao/userDao');

async function getUserList() {
    return userDao.getUserList();
}

async function getUserById(id) {
    return userDao.getUserById(id);
}

module.exports = {
    getUserList,
    getUserById,
};