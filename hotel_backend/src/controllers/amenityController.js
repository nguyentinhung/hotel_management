const { getAmenities } = require('../services/amenityService');

async function getAdminAmenities(_req, res) {
  try {
    return res.json(await getAmenities());
  } catch (error) {
    console.error('Get room amenities error:', error);
    return res.status(500).json({ message: 'Không thể tải danh sách tiện nghi.' });
  }
}

module.exports = { getAdminAmenities };
