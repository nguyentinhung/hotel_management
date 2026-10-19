const fs = require('fs');
const path = require('path');
const { ensureRuntimeSchema, getLegacyRoomImages, saveMigratedRoomImage } = require('../dao/startupDao');

async function prepareRuntimeDatabase(uploadsDir, port) {
  const schema = await ensureRuntimeSchema();
  if (!schema?.has_is_deleted) {
    throw new Error(`Database migration did not create dbo.services.is_deleted in "${schema?.database_name ?? 'unknown'}".`);
  }
  const legacyImages = await getLegacyRoomImages();
  for (const image of legacyImages) {
    try {
      const fileName = path.basename(new URL(image.image_url).pathname);
      const filePath = path.resolve(uploadsDir, fileName);
      if (!filePath.startsWith(`${path.resolve(uploadsDir)}${path.sep}`) || !fs.existsSync(filePath)) continue;
      const extension = path.extname(fileName).toLowerCase();
      const mimeType = extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg';
      await saveMigratedRoomImage({
        id: image.id,
        roomTypeId: image.room_type_id,
        imageData: fs.readFileSync(filePath),
        mimeType,
        port,
      });
    } catch (error) {
      console.error(`Could not migrate legacy room image row ${image.id}:`, error.message);
    }
  }
  if (legacyImages.length) {
    console.log(`Migrated ${legacyImages.length} legacy room image row(s) to SQL Server where source files were available.`);
  }
}

module.exports = { prepareRuntimeDatabase };
