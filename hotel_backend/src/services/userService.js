const userDao = require('../dao/userDao');

async function getUserList() {
    return userDao.getUserList();
}

module.exports = {
    getUserList,
};