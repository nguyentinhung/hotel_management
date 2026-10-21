const sql = require('mssql');
const { getPool } = require('../config/db');
const RoomTypeModel = require('../models/roomTypeModel');

async function findRoomTypeByName(name, exceptId = null) {
  const pool = await getPool();
  const request = pool.request().input('name', sql.NVarChar(100), name);
  let query = 'SELECT TOP (1) id FROM room_types WHERE LOWER(LTRIM(RTRIM(name))) = LOWER(@name)';
  if (exceptId != null) {
    request.input('roomTypeId', sql.Int, exceptId);
    query += ' AND id <> @roomTypeId';
  }
  const result = await request.query(`${query};`);
  return result.recordset[0] || null;
}

async function amenitiesExist(ids) {
  if (!ids.length) return true;
  const pool = await getPool();
  const request = pool.request();
  const params = ids.map((id, index) => {
    request.input(`amenityId${index}`, sql.Int, id);
    return `@amenityId${index}`;
  });
  const result = await request.query(`SELECT COUNT(*) AS count FROM amenities WHERE id IN (${params.join(', ')});`);
  return Number(result.recordset[0].count) === ids.length;
}

async function saveAmenities(transaction, roomTypeId, ids) {
  await new sql.Request(transaction).input('roomTypeId', sql.Int, roomTypeId)
    .query('DELETE FROM room_type_amenities WHERE room_type_id = @roomTypeId;');
  for (const amenityId of ids) {
    await new sql.Request(transaction).input('roomTypeId', sql.Int, roomTypeId)
      .input('amenityId', sql.Int, amenityId)
      .query('INSERT INTO room_type_amenities (room_type_id, amenity_id) VALUES (@roomTypeId, @amenityId);');
  }
}

async function createRoomType(data, amenityIds) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const result = await new sql.Request(transaction)
      .input('name', sql.NVarChar(100), data.name)
      .input('description', sql.NVarChar(sql.MAX), data.description)
      .input('base_price', sql.Decimal(12, 2), data.basePrice)
      .input('max_adults', sql.TinyInt, data.maxAdults)
      .input('max_children', sql.TinyInt, data.maxChildren)
      .query(`
        INSERT INTO room_types (name, description, base_price, max_adults, max_children)
        OUTPUT INSERTED.id, INSERTED.name, INSERTED.description, INSERTED.base_price,
               INSERTED.max_adults, INSERTED.max_children
        VALUES (@name, @description, @base_price, @max_adults, @max_children);
      `);
    const roomType = result.recordset[0];
    await saveAmenities(transaction, roomType.id, amenityIds);
    await transaction.commit();
    return roomType;
  } catch (error) {
    try { await transaction.rollback(); } catch (rollbackError) { console.error('Room type create rollback error:', rollbackError); }
    throw error;
  }
}

async function updateRoomType(roomTypeId, data, amenityIds) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const result = await new sql.Request(transaction)
      .input('roomTypeId', sql.Int, roomTypeId)
      .input('name', sql.NVarChar(100), data.name)
      .input('description', sql.NVarChar(sql.MAX), data.description)
      .input('base_price', sql.Decimal(12, 2), data.basePrice)
      .input('max_adults', sql.TinyInt, data.maxAdults)
      .input('max_children', sql.TinyInt, data.maxChildren)
      .query(`
        UPDATE room_types
        SET name = @name, description = @description, base_price = @base_price,
            max_adults = @max_adults, max_children = @max_children
        OUTPUT INSERTED.id, INSERTED.name, INSERTED.description, INSERTED.base_price,
               INSERTED.max_adults, INSERTED.max_children
        WHERE id = @roomTypeId;
      `);
    if (!result.recordset.length) {
      await transaction.rollback();
      return null;
    }
    await saveAmenities(transaction, roomTypeId, amenityIds);
    await transaction.commit();
    return RoomTypeModel.fromRow(result.recordset[0]);
  } catch (error) {
    try { await transaction.rollback(); } catch (rollbackError) { console.error('Room type update rollback error:', rollbackError); }
    throw error;
  }
}

async function deleteRoomType(roomTypeId) {
  const pool = await getPool();
  const usage = await pool.request().input('roomTypeId', sql.Int, roomTypeId).query(`
    SELECT
      (SELECT COUNT(*) FROM rooms WHERE room_type_id = @roomTypeId) AS room_count,
      (SELECT COUNT(*) FROM reviews WHERE room_type_id = @roomTypeId) AS review_count,
      (SELECT name FROM room_types WHERE id = @roomTypeId) AS room_type_name;
  `);
  const roomType = usage.recordset[0];
  if (!roomType.room_type_name) return { kind: 'NOT_FOUND' };
  if (Number(roomType.room_count) || Number(roomType.review_count)) return { kind: 'IN_USE', roomType };
  const deleted = await pool.request().input('roomTypeId', sql.Int, roomTypeId)
    .query('DELETE FROM room_types OUTPUT DELETED.id WHERE id = @roomTypeId;');
  return deleted.recordset.length ? { kind: 'DELETED', roomType } : { kind: 'NOT_FOUND' };
}

async function getPrimaryImage(roomTypeId) {
  const pool = await getPool();
  const result = await pool.request().input('roomTypeId', sql.Int, roomTypeId).query(`
    SELECT TOP (1) image_url, image_data, mime_type FROM room_type_images
    WHERE room_type_id = @roomTypeId AND is_primary = 1 ORDER BY id DESC;
  `);
  return result.recordset[0] || null;
}

async function savePrimaryImage(roomTypeId, imageUrl, imageFile) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const roomType = await new sql.Request(transaction).input('roomTypeId', sql.Int, roomTypeId)
      .query('SELECT id FROM room_types WITH (UPDLOCK, HOLDLOCK) WHERE id = @roomTypeId;');
    if (!roomType.recordset.length) {
      await transaction.rollback();
      return false;
    }
    await new sql.Request(transaction)
      .input('roomTypeId', sql.Int, roomTypeId)
      .input('imageUrl', sql.VarChar(500), imageUrl)
      .input('imageData', sql.VarBinary(sql.MAX), imageFile.buffer)
      .input('mimeType', sql.VarChar(100), imageFile.mimetype)
      .query(`
        UPDATE room_type_images SET is_primary = 0 WHERE room_type_id = @roomTypeId;
        INSERT INTO room_type_images (room_type_id, image_url, image_data, mime_type, is_primary)
        VALUES (@roomTypeId, @imageUrl, @imageData, @mimeType, 1);
      `);
    await transaction.commit();
    return true;
  } catch (error) {
    try { await transaction.rollback(); } catch (rollbackError) { console.error('Room image rollback error:', rollbackError); }
    throw error;
  }
}

module.exports = {
  findRoomTypeByName, amenitiesExist, createRoomType, updateRoomType,
  deleteRoomType, getPrimaryImage, savePrimaryImage,
};
