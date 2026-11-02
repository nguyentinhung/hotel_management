function toUpdateUserRequest(body = {}) { return { full_name: body?.full_name, email: body?.email, phone: body?.phone }; }
module.exports = { toUpdateUserRequest };
