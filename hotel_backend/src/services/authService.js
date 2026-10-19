const authDao = require('../dao/authDao');

module.exports = {
  findUserIdByEmail: (...args) => authDao.findUserIdByEmail(...args),
  findUserIdByPhone: (...args) => authDao.findUserIdByPhone(...args),
  getCustomerRole: (...args) => authDao.getCustomerRole(...args),
  createUser: (...args) => authDao.createUser(...args),
  createEmailVerification: (...args) => authDao.createEmailVerification(...args),
  cleanupPendingRegistration: (...args) => authDao.cleanupPendingRegistration(...args),
  getValidEmailVerification: (...args) => authDao.getValidEmailVerification(...args),
  activateVerifiedUser: (...args) => authDao.activateVerifiedUser(...args),
  getUserByEmail: (...args) => authDao.getUserByEmail(...args),
  createRefreshToken: (...args) => authDao.createRefreshToken(...args),
  revokeRefreshToken: (...args) => authDao.revokeRefreshToken(...args),
  getActiveUserByEmail: (...args) => authDao.getActiveUserByEmail(...args),
  invalidateUnusedPasswordResets: (...args) => authDao.invalidateUnusedPasswordResets(...args),
  createPasswordResetOtp: (...args) => authDao.createPasswordResetOtp(...args),
  markPasswordResetUsed: (...args) => authDao.markPasswordResetUsed(...args),
  getActiveUserIdByEmail: (...args) => authDao.getActiveUserIdByEmail(...args),
  getLatestValidPasswordReset: (...args) => authDao.getLatestValidPasswordReset(...args),
  updatePassword: (...args) => authDao.updatePassword(...args),
  getPasswordState: (...args) => authDao.getPasswordState(...args),
  markPasswordResetsUsedForUser: (...args) => authDao.markPasswordResetsUsedForUser(...args),
};
