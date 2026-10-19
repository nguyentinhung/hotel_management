const { listAmenities } = require('../dao/amenityDao');

async function getAmenities() {
  return listAmenities();
}

module.exports = { getAmenities };
