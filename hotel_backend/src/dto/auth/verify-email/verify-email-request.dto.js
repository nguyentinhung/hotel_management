function toVerifyEmailRequest(query = {}) { return { token: query?.token }; }
module.exports = { toVerifyEmailRequest };
