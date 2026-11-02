function toResetPasswordRequest(body = {}) { return { email: body?.email, otp: body?.otp, newPassword: body?.newPassword }; }
module.exports = { toResetPasswordRequest };
