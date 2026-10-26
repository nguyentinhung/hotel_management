const { getProfileByUserId, updateProfileByUserId } = require('../dao/profileDao');
const ProfileModel = require('../models/profileModel');

async function getProfile(userId) {
  return ProfileModel.fromResult(await getProfileByUserId(userId));
}

async function updateProfile(userId, input = {}) {
  const { fullName, phone } = ProfileModel.normalizeUpdate(input);
  return ProfileModel.fromResult(await updateProfileByUserId(userId, fullName, phone));
}

module.exports = { getProfile, updateProfile };
