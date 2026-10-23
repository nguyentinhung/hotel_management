const staffDao = require('../dao/staffDao');
const StaffModel = require('../models/staffModel');

async function getStaffList(req, res) {
  try {
    const staff = await staffDao.findAll(String(req.query.search || '').trim());
    return res.json({ success: true, count: staff.length, staff });
  } catch (error) {
    console.error('Get staff list failed:', error);
    return res.status(500).json({ success: false, message: 'Không thể tải danh sách nhân viên.' });
  }
}

async function getStaffDetails(req, res) {
  try {
    const staff = await staffDao.findById(req.params.staffId);
    if (!staff) return res.status(404).json({ success: false, message: 'Không tìm thấy nhân viên.' });
    return res.json({ success: true, staff });
  } catch (error) {
    console.error('Get staff details failed:', error);
    return res.status(500).json({ success: false, message: 'Không thể tải thông tin nhân viên.' });
  }
}

async function updateStaffInfo(req, res) {
  const id = Number(req.params.staffId);
  if (!Number.isSafeInteger(id)) return res.status(400).json({ success: false, message: 'Mã nhân viên không hợp lệ.' });
  let staffInput;
  try { staffInput = StaffModel.normalizeUpdate(req.body); }
  catch (error) { return res.status(400).json({ success: false, message: error.message }); }

  try {
    if (!await staffDao.findById(id)) return res.status(404).json({ success: false, message: 'Không tìm thấy nhân viên.' });
    if (await staffDao.emailExists(staffInput.email, id)) return res.status(409).json({ success: false, message: 'Email này đã được sử dụng.' });
    const staff = await staffDao.updateInfo(id, staffInput);
    return res.json({ success: true, staff });
  } catch (error) {
    console.error('Update staff info failed:', error);
    return res.status(500).json({ success: false, message: 'Không thể cập nhật thông tin nhân viên.' });
  }
}

async function updateStaffStatus(req, res) {
  const id = Number(req.params.staffId);
  if (!Number.isSafeInteger(id)) return res.status(400).json({ success: false, message: 'Mã nhân viên không hợp lệ.' });
  let status;
  try { status = StaffModel.normalizeEmploymentStatus(req.body?.status); }
  catch (error) { return res.status(400).json({ success: false, message: error.message }); }

  try {
    const current = await staffDao.findById(id);
    if (!current) return res.status(404).json({ success: false, message: 'Không tìm thấy nhân viên.' });
    if (Number(req.user?.user_id || req.user?.id) === Number(current.user_id)) {
      return res.status(400).json({ success: false, message: 'Bạn không thể tự thay đổi trạng thái làm việc của mình.' });
    }
    if (!await staffDao.updateStatus(id, status)) return res.status(404).json({ success: false, message: 'Không tìm thấy nhân viên.' });
    return res.json({ success: true, staff: await staffDao.findById(id) });
  } catch (error) {
    console.error('Update staff status failed:', error);
    return res.status(500).json({ success: false, message: 'Không thể cập nhật trạng thái nhân viên.' });
  }
}

module.exports = { getStaffList, getStaffDetails, updateStaffInfo, updateStaffStatus };
