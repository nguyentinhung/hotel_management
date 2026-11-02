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

    IF COL_LENGTH(N'dbo.bookings', N'hold_until') IS NULL
      ALTER TABLE dbo.bookings ADD hold_until DATETIME2 NULL;
    IF COL_LENGTH(N'dbo.bookings', N'hold_extended') IS NULL
      ALTER TABLE dbo.bookings ADD hold_extended BIT NOT NULL
        CONSTRAINT DF_bookings_hold_extended DEFAULT (0) WITH VALUES;
    IF COL_LENGTH(N'dbo.bookings', N'expected_arrival_at') IS NULL
      ALTER TABLE dbo.bookings ADD expected_arrival_at DATETIME2 NULL;

    IF OBJECT_ID(N'dbo.booking_hold_events', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.booking_hold_events (
        id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        booking_id BIGINT NOT NULL,
        event_type VARCHAR(24) NOT NULL,
        old_hold_until DATETIME2 NULL,
        new_hold_until DATETIME2 NULL,
        expected_arrival_at DATETIME2 NULL,
        reason NVARCHAR(500) NOT NULL,
        performed_by_user_id BIGINT NULL,
        performed_by_staff_id BIGINT NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_booking_hold_events_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_booking_hold_events_bookings FOREIGN KEY (booking_id) REFERENCES dbo.bookings(id),
        CONSTRAINT FK_booking_hold_events_users FOREIGN KEY (performed_by_user_id) REFERENCES dbo.users(id),
        CONSTRAINT FK_booking_hold_events_staff FOREIGN KEY (performed_by_staff_id) REFERENCES dbo.staff(id)
      );
      CREATE INDEX IX_booking_hold_events_booking_id ON dbo.booking_hold_events(booking_id, created_at);
    END;
    IF OBJECT_ID(N'dbo.room_equipment_assignments', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.room_equipment_assignments (
        room_id INT NOT NULL,
        equipment_item_id INT NOT NULL,
        assigned_at DATETIME2 NOT NULL CONSTRAINT DF_room_equipment_assignments_assigned_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_room_equipment_assignments PRIMARY KEY (room_id, equipment_item_id),
        CONSTRAINT FK_room_equipment_assignments_room FOREIGN KEY (room_id)
          REFERENCES dbo.rooms(id) ON DELETE CASCADE,
        CONSTRAINT FK_room_equipment_assignments_equipment FOREIGN KEY (equipment_item_id)
          REFERENCES dbo.equipment_items(id) ON DELETE CASCADE
      );
    END;

    IF OBJECT_ID(N'dbo.booking_extensions', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.booking_extensions (
        id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        booking_id BIGINT NOT NULL,
        previous_check_out_date DATE NOT NULL,
        new_check_out_date DATE NOT NULL,
        nights_added INT NOT NULL,
        price_per_night DECIMAL(12,2) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        note NVARCHAR(255) NULL,
        performed_by_user_id BIGINT NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_booking_extensions_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_booking_extensions_bookings FOREIGN KEY (booking_id) REFERENCES dbo.bookings(id),
        CONSTRAINT FK_booking_extensions_users FOREIGN KEY (performed_by_user_id) REFERENCES dbo.users(id)
      );
      CREATE INDEX IX_booking_extensions_booking_id ON dbo.booking_extensions(booking_id, created_at);
    END;
  `);
  await pool.request().query(`
    IF COL_LENGTH(N'dbo.booking_hold_events', N'performed_by_staff_id') IS NULL
      ALTER TABLE dbo.booking_hold_events ADD performed_by_staff_id BIGINT NULL;
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_booking_hold_events_staff')
      ALTER TABLE dbo.booking_hold_events WITH CHECK
        ADD CONSTRAINT FK_booking_hold_events_staff
        FOREIGN KEY (performed_by_staff_id) REFERENCES dbo.staff(id);
  `);
  // Keep legacy booking values untouched. Hold deadlines are derived from
  // created_at/check_in_date when read; no startup UPDATE normalizes rows.
  const result = await pool.request().query(`
    SELECT DB_NAME() AS database_name,
           CASE WHEN COL_LENGTH(N'dbo.services', N'is_deleted') IS NULL THEN 0 ELSE 1 END AS has_is_deleted,
           CASE WHEN COL_LENGTH(N'dbo.bookings', N'hold_until') IS NULL THEN 0 ELSE 1 END AS has_booking_hold;
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
