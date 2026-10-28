const staffDao = require('../dao/staffDao');
const StaffModel = require('../models/staffModel');

class StaffServiceError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

async function list(search) {
  return StaffModel.fromResult(await staffDao.findAll(String(search || '').trim()));
}

async function get(id) {
  return StaffModel.fromResult(await staffDao.findById(id));
}

async function updateInfo(id, body) {
  let input;
  try { input = StaffModel.normalizeUpdate(body); }
  catch (error) { error.code = 'INVALID_INPUT'; throw error; }
  if (!await staffDao.findById(id)) throw new StaffServiceError('NOT_FOUND');
  if (await staffDao.emailExists(input.email, id)) throw new StaffServiceError('EMAIL_EXISTS');
  return StaffModel.fromResult(await staffDao.updateInfo(id, input));
}

async function updateStatus(id, status, actorId) {
  let normalizedStatus;
  try { normalizedStatus = StaffModel.normalizeEmploymentStatus(status); }
  catch (error) { error.code = 'INVALID_INPUT'; throw error; }
  const current = await staffDao.findById(id);
  if (!current) throw new StaffServiceError('NOT_FOUND');
  if (Number(actorId) === Number(current.user_id)) throw new StaffServiceError('SELF_STATUS_CHANGE');
  if (!await staffDao.updateStatus(id, normalizedStatus)) throw new StaffServiceError('NOT_FOUND');
  return StaffModel.fromResult(await staffDao.findById(id));
}

module.exports = { list, get, updateInfo, updateStatus, StaffServiceError };
