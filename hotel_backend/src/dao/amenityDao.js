const { getPool } = require('../config/db');

async function listAmenities() {
  const pool = await getPool();
  const result = await pool.request().query('SELECT id, name FROM amenities ORDER BY name, id;');
  return result.recordset;
}

module.exports = { listAmenities };
