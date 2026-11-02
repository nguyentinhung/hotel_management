const staffDao = require('../dao/staffDao');

class StaffServiceError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function normalizeUpdate(input = {}) {
  const full_name = String(input.full_name || '').trim();
  const email = String(input.email || '').trim().toLowerCase();
  const phone = String(input.phone || '').trim();
  const gender = String(input.gender || '').trim();
  const address = String(input.address || '').trim();
  const position = String(input.position || '').trim();
  const date_of_birth = input.date_of_birth || null;
  const hire_date = input.hire_date || null;
  const isValidDate = (value) => {
    if (!value) return true;
    const text = String(value);
    if (text.length !== 10 || text[4] !== '-' || text[7] !== '-') return false;
    const date = new Date(`${text}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
  };

  if (!full_name || full_name.length > 255) throw new Error('Họ tên không hợp lệ.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) throw new Error('Email không hợp lệ.');
  if (phone.length > 20 || gender.length > 20 || address.length > 500 || position.length > 100) {
    throw new Error('Thông tin nhân viên vượt quá độ dài cho phép.');
  }
  if (!isValidDate(date_of_birth) || !isValidDate(hire_date)) throw new Error('Ngày sinh hoặc ngày vào làm không hợp lệ.');
  return { full_name, email, phone, gender, date_of_birth, address, position, hire_date };
}

function normalizeEmploymentStatus(status) {
  const normalized = String(status || '').trim().toUpperCase();
  if (!['ACTIVE', 'INACTIVE'].includes(normalized)) throw new Error('Trạng thái làm việc không hợp lệ.');
  return normalized;
}

async function list(search) {
  return await staffDao.findAll(String(search || '').trim());
}

async function get(id) {
  return await staffDao.findById(id);
}

async function updateInfo(id, body) {
  let input;
  try { input = normalizeUpdate(body); }
  catch (error) { error.code = 'INVALID_INPUT'; throw error; }
  if (!await staffDao.findById(id)) throw new StaffServiceError('NOT_FOUND');
  if (await staffDao.emailExists(input.email, id)) throw new StaffServiceError('EMAIL_EXISTS');
  return await staffDao.updateInfo(id, input);
}

async function updateStatus(id, status, actorId) {
  let normalizedStatus;
  try { normalizedStatus = normalizeEmploymentStatus(status); }
  catch (error) { error.code = 'INVALID_INPUT'; throw error; }
  const current = await staffDao.findById(id);
  if (!current) throw new StaffServiceError('NOT_FOUND');
  if (Number(actorId) === Number(current.user_id)) throw new StaffServiceError('SELF_STATUS_CHANGE');
  if (!await staffDao.updateStatus(id, normalizedStatus)) throw new StaffServiceError('NOT_FOUND');
  return await staffDao.findById(id);
}

module.exports = { list, get, updateInfo, updateStatus, StaffServiceError };
