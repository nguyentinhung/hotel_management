function toRegisterRequest(body = {}) {
  return { email: body?.email, password: body?.password, full_name: body?.full_name, phone_number: body?.phone_number };
}
module.exports = { toRegisterRequest };
