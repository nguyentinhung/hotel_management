function toChangePasswordRequest(body = {}) { return { currentPassword: body?.currentPassword, newPassword: body?.newPassword }; }
module.exports = { toChangePasswordRequest };
