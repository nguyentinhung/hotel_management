const { getProfileByUserId, updateProfileByUserId } = require('../dao/profileDao');
const ProfileModel = require('../models/profileModel');

async function getProfile(userId) {
  return getProfileByUserId(userId);
}

async function updateProfile(userId, input = {}) {
  const { fullName, phone } = ProfileModel.normalizeUpdate(input);
  return updateProfileByUserId(userId, fullName, phone);
}

module.exports = { getProfile, updateProfile };
