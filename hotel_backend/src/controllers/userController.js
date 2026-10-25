const userService = require('../services/userService');

function sendError(res, error, fallback) {
  console.error(fallback, error);
  return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : fallback });
}

async function getUserList(req, res) {
  try { return res.json({ users: await userService.getUserList(req.query.search) }); }
  catch (error) { return sendError(res, error, 'Không thể tải danh sách người dùng.'); }
}

async function getUserDetails(req, res) {
  try {
    const user = await userService.getUserById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng.' });
    return res.json({ user });
  } catch (error) { return sendError(res, error, 'Không thể tải chi tiết người dùng.'); }
}

async function createUser(req, res) {
  try { return res.status(201).json({ message: 'Tạo tài khoản thành công.', user: await userService.createUser(req.body) }); }
  catch (error) { return sendError(res, error, 'Không thể tạo tài khoản người dùng.'); }
}

async function updateUser(req, res) {
  try { return res.json({ message: 'Cập nhật người dùng thành công.', user: await userService.updateUser(req.params.id, req.body) }); }
  catch (error) { return sendError(res, error, 'Không thể cập nhật người dùng.'); }
}

async function lockUser(req, res) {
  try { return res.json({ message: 'Khóa tài khoản thành công.', user: await userService.lockUser(req.params.id, req.user.user_id) }); }
  catch (error) { return sendError(res, error, 'Không thể khóa tài khoản.'); }
}

async function unlockUser(req, res) {
  try { return res.json({ message: 'Mở khóa tài khoản thành công.', user: await userService.unlockUser(req.params.id) }); }
  catch (error) { return sendError(res, error, 'Không thể mở khóa tài khoản.'); }
}

async function assignUserRole(req, res) {
  try {
    const user = await userService.assignUserRole(req.params.id, req.body?.role_code, req.user.user_id);
    return res.json({ message: 'Phân quyền người dùng thành công.', user });
  } catch (error) { return sendError(res, error, 'Không thể phân quyền người dùng.'); }
}

module.exports = { getUserList, getUserDetails, createUser, updateUser, lockUser, unlockUser, assignUserRole };
