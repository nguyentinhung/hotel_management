function toCreateUserRequest(body = {}) { return { full_name: body?.full_name, email: body?.email, phone: body?.phone, password: body?.password, role_code: body?.role_code }; }
module.exports = { toCreateUserRequest };
