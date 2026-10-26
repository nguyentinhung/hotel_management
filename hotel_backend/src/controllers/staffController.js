const staffService = require('../services/staffService');

const messages = {
  NOT_FOUND: 'Kh\u00f4ng t\u00ecm th\u1ea5y nh\u00e2n vi\u00ean.',
  EMAIL_EXISTS: 'Email n\u00e0y \u0111\u00e3 \u0111\u01b0\u1ee3c s\u1eed d\u1ee5ng.',
  SELF_STATUS_CHANGE: 'B\u1ea1n kh\u00f4ng th\u1ec3 t\u1ef1 thay \u0111\u1ed5i tr\u1ea1ng th\u00e1i l\u00e0m vi\u1ec7c c\u1ee7a m\u00ecnh.',
};

async function getStaffList(req, res) {
  try {
    const staff = await staffService.list(req.query.search);
    return res.json({ success: true, count: staff.length, staff });
  } catch (error) {
    console.error('Get staff list failed:', error);
    return res.status(500).json({ success: false, message: 'Kh\u00f4ng th\u1ec3 t\u1ea3i danh s\u00e1ch nh\u00e2n vi\u00ean.' });
  }
}

async function getStaffDetails(req, res) {
  try {
    const staff = await staffService.get(req.params.staffId);
    if (!staff) return res.status(404).json({ success: false, message: messages.NOT_FOUND });
    return res.json({ success: true, staff });
  } catch (error) {
    console.error('Get staff details failed:', error);
    return res.status(500).json({ success: false, message: 'Kh\u00f4ng th\u1ec3 t\u1ea3i th\u00f4ng tin nh\u00e2n vi\u00ean.' });
  }
}

async function updateStaffInfo(req, res) {
  const id = Number(req.params.staffId);
  if (!Number.isSafeInteger(id)) return res.status(400).json({ success: false, message: 'M\u00e3 nh\u00e2n vi\u00ean kh\u00f4ng h\u1ee3p l\u1ec7.' });
  try {
    const staff = await staffService.updateInfo(id, req.body);
    return res.json({ success: true, staff });
  } catch (error) {
    if (error.code === 'INVALID_INPUT') return res.status(400).json({ success: false, message: error.message });
    if (error instanceof staffService.StaffServiceError) {
      const status = error.code === 'NOT_FOUND' ? 404 : 409;
      return res.status(status).json({ success: false, message: messages[error.code] });
    }
    console.error('Update staff info failed:', error);
    return res.status(500).json({ success: false, message: 'Kh\u00f4ng th\u1ec3 c\u1eadp nh\u1eadt th\u00f4ng tin nh\u00e2n vi\u00ean.' });
  }
}

async function updateStaffStatus(req, res) {
  const id = Number(req.params.staffId);
  if (!Number.isSafeInteger(id)) return res.status(400).json({ success: false, message: 'M\u00e3 nh\u00e2n vi\u00ean kh\u00f4ng h\u1ee3p l\u1ec7.' });
  try {
    const staff = await staffService.updateStatus(id, req.body?.status, req.user?.user_id || req.user?.id);
    return res.json({ success: true, staff });
  } catch (error) {
    if (error.code === 'INVALID_INPUT') return res.status(400).json({ success: false, message: error.message });
    if (error instanceof staffService.StaffServiceError) {
      const status = error.code === 'SELF_STATUS_CHANGE' ? 400 : 404;
      return res.status(status).json({ success: false, message: messages[error.code] });
    }
    console.error('Update staff status failed:', error);
    return res.status(500).json({ success: false, message: 'Kh\u00f4ng th\u1ec3 c\u1eadp nh\u1eadt tr\u1ea1ng th\u00e1i nh\u00e2n vi\u00ean.' });
  }
}

module.exports = { getStaffList, getStaffDetails, updateStaffInfo, updateStaffStatus };
