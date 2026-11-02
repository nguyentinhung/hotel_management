function toLogoutRequest(body = {}) { return { refreshToken: body?.refreshToken }; }
module.exports = { toLogoutRequest };
