const { getProfileByUserId, updateProfileByUserId } = require('../dao/profileDao');

async function getProfile(userId) {
  return getProfileByUserId(userId);
}

async function updateProfile(userId, input = {}) {
  const fullName = typeof input.full_name === 'string' ? input.full_name.trim() : '';
  const phone = typeof input.phone === 'string' ? input.phone.trim() : '';
  if (!fullName || fullName.length > 255) {
    const error = new Error('Họ tên không được để trống và tối đa 255 ký tự.');
    error.statusCode = 400;
    throw error;
  }
  if (!/^\+?[0-9\s\-()]{9,20}$/.test(phone) || phone.replace(/\D/g, '').length < 9) {
    const error = new Error('Số điện thoại không đúng định dạng.');
    error.statusCode = 400;
    throw error;
  }
  return updateProfileByUserId(userId, fullName, phone);
}

module.exports = { getProfile, updateProfile };
