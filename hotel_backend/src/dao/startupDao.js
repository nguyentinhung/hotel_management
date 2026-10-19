const { sql, getPool } = require('../config/db');

async function ensureRuntimeSchema() {
  const pool = await getPool();
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.services', N'U') IS NOT NULL
       AND COL_LENGTH('dbo.services', 'is_deleted') IS NULL
    BEGIN
      ALTER TABLE dbo.services
        ADD is_deleted BIT NOT NULL
          CONSTRAINT DF_services_is_deleted DEFAULT (0) WITH VALUES;
    END;
    IF COL_LENGTH('dbo.room_type_images', 'image_data') IS NULL
      ALTER TABLE dbo.room_type_images ADD image_data VARBINARY(MAX) NULL;
    IF COL_LENGTH('dbo.room_type_images', 'mime_type') IS NULL
      ALTER TABLE dbo.room_type_images ADD mime_type VARCHAR(100) NULL;
  `);
  const result = await pool.request().query(`
    SELECT DB_NAME() AS database_name,
           CASE WHEN COL_LENGTH(N'dbo.services', N'is_deleted') IS NULL THEN 0 ELSE 1 END AS has_is_deleted;
  `);
  return result.recordset[0];
}

async function getLegacyRoomImages() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT id, room_type_id, image_url
    FROM dbo.room_type_images
    WHERE image_data IS NULL AND image_url LIKE '%/uploads/%';
  `);
  return result.recordset;
}

async function saveMigratedRoomImage({ id, roomTypeId, imageData, mimeType, port }) {
  const pool = await getPool();
  await pool.request()
    .input('imageId', sql.Int, id)
    .input('imageUrl', sql.VarChar(500), `http://localhost:${port}/api/room-types/${roomTypeId}/image`)
    .input('imageData', sql.VarBinary(sql.MAX), imageData)
    .input('mimeType', sql.VarChar(100), mimeType)
    .query(`
      UPDATE dbo.room_type_images
      SET image_url = @imageUrl, image_data = @imageData, mime_type = @mimeType
      WHERE id = @imageId AND image_data IS NULL;
    `);
}

module.exports = { ensureRuntimeSchema, getLegacyRoomImages, saveMigratedRoomImage };
