const { getPool } = require('../config/db');
const AmenityModel = require('../models/amenityModel');

async function listAmenities() {
  const pool = await getPool();
  const result = await pool.request().query('SELECT id, name FROM amenities ORDER BY name, id;');
  return AmenityModel.fromRows(result.recordset);
}

module.exports = { listAmenities };
