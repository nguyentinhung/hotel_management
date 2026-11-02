function toUpdateProfileRequest(body = {}) { return { full_name: body?.full_name, phone: body?.phone }; }
module.exports = { toUpdateProfileRequest };
