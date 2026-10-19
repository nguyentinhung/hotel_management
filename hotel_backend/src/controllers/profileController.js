const profileService = require('../services/profileService');

async function getProfile(req, res) {
  try {
    const user = await profileService.getProfile(req.auth.userId);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
    return res.json({ user });
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({ message: 'Không thể tải hồ sơ lúc này.' });
  }
}

async function updateProfile(req, res) {
  try {
    const user = await profileService.updateProfile(req.auth.userId, req.body);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
    return res.json({ message: 'Cập nhật hồ sơ thành công.', user });
  } catch (error) {
    if (error.statusCode === 400) return res.status(400).json({ message: error.message });
    console.error('Update profile error:', error);
    return res.status(500).json({ message: 'Không thể cập nhật hồ sơ lúc này.' });
  }
}

module.exports = { getProfile, updateProfile };
