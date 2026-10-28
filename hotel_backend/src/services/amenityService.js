const { listAmenities } = require('../dao/amenityDao');
const AmenityModel = require('../models/amenityModel');

async function getAmenities() {
  return AmenityModel.fromResult(await listAmenities());
}

module.exports = { getAmenities };
