const { listAmenities } = require('../dao/amenityDao');

async function getAmenities() {
  return await listAmenities();
}

module.exports = { getAmenities };
