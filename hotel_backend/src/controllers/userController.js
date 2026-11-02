const userService = require('../services/userService');
const { toUserListResponse } = require('../dto/user/view-user-list/user-list-response.dto');
const { toUserDetailsResponse } = require('../dto/user/view-user-details/user-details-response.dto');
const { toCreateUserRequest } = require('../dto/user/create-user/create-user-request.dto');
const { toCreateUserResponse } = require('../dto/user/create-user/create-user-response.dto');
const { toUpdateUserRequest } = require('../dto/user/update-user/update-user-request.dto');
const { toUpdateUserResponse } = require('../dto/user/update-user/update-user-response.dto');
const { toAssignUserRoleRequest } = require('../dto/user/assign-user-role/assign-user-role-request.dto');
const { toAssignUserRoleResponse } = require('../dto/user/assign-user-role/assign-user-role-response.dto');
const { toLockUserResponse } = require('../dto/user/lock-user/lock-user-response.dto');
const { toUnlockUserResponse } = require('../dto/user/unlock-user/unlock-user-response.dto');
const { toUserListRequest } = require('../dto/user/view-user-list/user-list-request.dto');

function sendError(res, error, fallback) {
  console.error(fallback, error);
  return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : fallback });
}

async function getUserList(req, res) {
  try { return res.json(toUserListResponse(await userService.getUserList(toUserListRequest(req.query).search))); }
  catch (error) { return sendError(res, error, 'Không thể tải danh sách người dùng.'); }
}

async function getUserDetails(req, res) {
  try {
    const user = await userService.getUserById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng.' });
    return res.json(toUserDetailsResponse(user));
  } catch (error) { return sendError(res, error, 'Không thể tải chi tiết người dùng.'); }
}

async function createUser(req, res) {
  try { return res.status(201).json(toCreateUserResponse(await userService.createUser(toCreateUserRequest(req.body)))); }
  catch (error) { return sendError(res, error, 'Không thể tạo tài khoản người dùng.'); }
}

async function updateUser(req, res) {
  try { return res.json(toUpdateUserResponse(await userService.updateUser(req.params.id, toUpdateUserRequest(req.body)))); }
  catch (error) { return sendError(res, error, 'Không thể cập nhật người dùng.'); }
}

async function lockUser(req, res) {
  try { return res.json(toLockUserResponse(await userService.lockUser(req.params.id, req.user.user_id))); }
  catch (error) { return sendError(res, error, 'Không thể khóa tài khoản.'); }
}

async function unlockUser(req, res) {
  try { return res.json(toUnlockUserResponse(await userService.unlockUser(req.params.id))); }
  catch (error) { return sendError(res, error, 'Không thể mở khóa tài khoản.'); }
}

async function assignUserRole(req, res) {
  try {
    const { role_code: roleCode } = toAssignUserRoleRequest(req.body);
    const user = await userService.assignUserRole(req.params.id, roleCode, req.user.user_id);
    return res.json(toAssignUserRoleResponse(user));
  } catch (error) { return sendError(res, error, 'Không thể phân quyền người dùng.'); }
}

module.exports = { getUserList, getUserDetails, createUser, updateUser, lockUser, unlockUser, assignUserRole };
