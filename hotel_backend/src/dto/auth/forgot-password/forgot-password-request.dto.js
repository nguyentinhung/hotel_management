function toForgotPasswordRequest(body = {}) { return { email: body?.email }; }
module.exports = { toForgotPasswordRequest };
