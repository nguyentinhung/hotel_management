function toLoginRequest(body = {}) { return { email: body?.email, password: body?.password }; }
module.exports = { toLoginRequest };
