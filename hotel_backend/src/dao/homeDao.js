const { getPool } = require('../config/db');

async function getRoomTypes() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT
      rt.id,
      rt.name,
      rt.description,
      rt.base_price,
      rt.max_adults,
      rt.max_children,
      (
        SELECT TOP 1 rti.image_url
        FROM room_type_images rti
        WHERE rti.room_type_id = rt.id AND rti.is_primary = 1
        ORDER BY rti.id
      ) AS image_url,
      (
        SELECT STRING_AGG(a.name, ', ')
        FROM room_type_amenities rta
        JOIN amenities a ON a.id = rta.amenity_id
        WHERE rta.room_type_id = rt.id
      ) AS amenities,
      (
        SELECT AVG(r.rating)
        FROM reviews r
        WHERE r.room_type_id = rt.id AND r.is_hidden = 0
      ) AS average_rating,
      (
        SELECT COUNT(*)
        FROM reviews r
        WHERE r.room_type_id = rt.id AND r.is_hidden = 0
      ) AS review_count
    FROM room_types rt
    ORDER BY rt.id;
  `);

  return result.recordset;
}

async function getPromotions() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT id, code, name, description, discount_type, discount_value, max_discount,
           valid_from, valid_to, is_active
    FROM promotions
    WHERE is_active = 1 AND GETDATE() BETWEEN valid_from AND valid_to
    ORDER BY id;
  `);

  return result.recordset;
}

async function getServices(activeOnly = true) {
  const pool = await getPool();
  const request = pool.request();
  let query = `
    SELECT id, name, description, price, unit, is_active
    FROM services
  `;

  if (activeOnly) {
    query += ` WHERE is_active = 1 `;
  }

  query += ` ORDER BY id;`;

  const result = await request.query(query);
  return result.recordset;
}

async function getReviews() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT
      r.id,
      r.room_type_id,
      u.full_name AS customer_name,
      r.rating,
      r.comment,
      r.is_hidden,
      rt.name AS room_type_name
    FROM reviews r
    JOIN users u ON u.id = r.customer_id
    JOIN room_types rt ON rt.id = r.room_type_id
    WHERE r.is_hidden = 0
    ORDER BY r.id DESC;
  `);

  return result.recordset;
}

module.exports = {
  getRoomTypes,
  getPromotions,
  getServices,
  getReviews,
};
