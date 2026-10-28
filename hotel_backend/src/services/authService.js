const authDao = require('../dao/authDao');
const UserModel = require('../models/userModel');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { jwtSecret: JWT_SECRET } = require('../config/auth');

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function passwordMatches(password, passwordHash) {
  if (passwordHash === password) return true;
  return bcrypt.compare(password, passwordHash).catch(() => false);
}

async function passwordHashMatches(password, passwordHash) {
  return bcrypt.compare(password, passwordHash).catch(() => false);
}

function createAccessToken(user) {
  return jwt.sign({
    user_id: user.id,
    email: user.email,
    role_id: user.role_id,
    role_code: user.role_code,
  }, JWT_SECRET, { expiresIn: '1h' });
}

function createOpaqueToken(bytes = 32) {
  return require('crypto').randomBytes(bytes).toString('hex');
}

function createOtp() {
  return String(require('crypto').randomInt(100000, 1000000));
}

module.exports = {
  normalizeEmail: (value) => UserModel.normalizeEmail(value),
  normalizePhone: (value) => UserModel.normalizePhone(value),
  isValidEmail: (value) => UserModel.isValidEmail(value),
  isValidPhone: (value) => UserModel.isValidPhone(value),
  hashPassword,
  passwordMatches,
  passwordHashMatches,
  createAccessToken,
  createOpaqueToken,
  createOtp,
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
