const bcrypt = require('bcryptjs');
const UserModel = require('../models/userModel');
const userDao = require('../dao/userDao');

const ROLE_CODES = ['ADMIN', 'RECEPTIONIST', 'HOUSEKEEPER', 'CUSTOMER'];
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });

function normalizeId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw fail(400, 'ID người dùng không hợp lệ.');
  return id;
}

function normalizeUserFields(data) {
  const fullName = String(data.full_name || '').trim();
  const email = UserModel.normalizeEmail(data.email);
  const phone = UserModel.normalizePhone(data.phone);
  if (!fullName || fullName.length > 255 || !email || !phone) throw fail(400, 'Vui lòng nhập đầy đủ thông tin hợp lệ.');
  if (!UserModel.isValidEmail(email) || email.length > 150) throw fail(400, 'Email không đúng định dạng hoặc vượt quá 150 ký tự.');
  if (!UserModel.isValidPhone(phone) || phone.length > 20 || phone.replace(/\D/g, '').length < 9) throw fail(400, 'Số điện thoại không đúng định dạng.');
  return { fullName, email, phone };
}

async function getUserList(search = '') {
  return UserModel.fromResult(await userDao.getUserList(String(search || '').trim().slice(0, 255)));
}

async function getUserById(id) { return UserModel.fromResult(await userDao.getUserById(normalizeId(id))); }

async function ensureUnique(email, phone, exceptId) {
  const [emailMatch, phoneMatch] = await Promise.all([
    exceptId ? userDao.getUserByEmailExceptId(email, exceptId) : userDao.getUserByEmail(email),
    exceptId ? userDao.getUserByPhoneExceptId(phone, exceptId) : userDao.getUserByPhone(phone),
  ]);
  if (emailMatch) throw fail(409, 'Email đã được tài khoản khác sử dụng.');
  if (phoneMatch) throw fail(409, 'Số điện thoại đã được tài khoản khác sử dụng.');
}

async function createUser(data = {}) {
  data = data || {};
  const { fullName, email, phone } = normalizeUserFields(data);
  const password = String(data.password || '');
  const roleCode = String(data.role_code || '').trim().toUpperCase();
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s])\S{8,}$/.test(password)) {
    throw fail(400, 'Mật khẩu cần ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt, không có khoảng trắng.');
  }
  if (!ROLE_CODES.includes(roleCode)) throw fail(400, 'Vai trò không hợp lệ.');
  await ensureUnique(email, phone);
  const passwordHash = await bcrypt.hash(password, 10);
  return UserModel.fromResult(await userDao.createUser({ fullName, email, phone, passwordHash, roleCode }));
}

async function updateUser(id, data = {}) {
  data = data || {};
  const userId = normalizeId(id);
  if (!await userDao.getUserById(userId)) throw fail(404, 'Không tìm thấy người dùng.');
  const fields = normalizeUserFields(data);
  await ensureUnique(fields.email, fields.phone, userId);
  return UserModel.fromResult(await userDao.updateUser(userId, fields));
}

async function changeStatus(id, status, actorId) {
  const userId = normalizeId(id);
  const user = await userDao.getUserById(userId);
  if (!user) throw fail(404, 'Không tìm thấy người dùng.');
  if (status === 'LOCKED' && Number(actorId) === userId) throw fail(400, 'Bạn không thể khóa tài khoản đang đăng nhập.');
  if (user.status === status) throw fail(400, status === 'LOCKED' ? 'Tài khoản đã bị khóa.' : 'Tài khoản đang hoạt động.');
  if (!await (status === 'LOCKED' ? userDao.lockUser(userId) : userDao.unlockUser(userId))) throw fail(500, 'Không thể cập nhật trạng thái tài khoản.');
  return UserModel.fromResult(await userDao.getUserById(userId));
}

const lockUser = (id, actorId) => changeStatus(id, 'LOCKED', actorId);
const unlockUser = (id) => changeStatus(id, 'ACTIVE');

async function assignUserRole(id, roleCode, actorId) {
  const userId = normalizeId(id);
  const normalizedRole = String(roleCode || '').trim().toUpperCase();
  if (!ROLE_CODES.includes(normalizedRole)) throw fail(400, 'Vai trò không hợp lệ.');
  if (Number(actorId) === userId) throw fail(400, 'Bạn không thể tự thay đổi vai trò của tài khoản đang đăng nhập.');
  if (!await userDao.getUserById(userId)) throw fail(404, 'Không tìm thấy người dùng.');
  if (!await userDao.assignUserRole(userId, normalizedRole)) throw fail(400, 'Không thể phân quyền người dùng.');
  return UserModel.fromResult(await userDao.getUserById(userId));
}

module.exports = { getUserList, getUserById, createUser, updateUser, lockUser, unlockUser, assignUserRole };
