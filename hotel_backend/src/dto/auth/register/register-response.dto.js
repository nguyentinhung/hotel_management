function toRegisterResponse(message, user) {
  return { message, user: { id: user.id, email: user.email, full_name: user.full_name, phone: user.phone, status: String(user.status || '').toUpperCase(), role_id: user.role_id, role_code: user.role_code, role_name: user.role_name || 'Khách hàng' } };
}
module.exports = { toRegisterResponse };
