const path = require('path');
const fs = require('fs');
const roomTypeService = require('../services/roomTypeService');

const uploadsDir = path.join(__dirname, '../../uploads');

async function createRoomType(req, res) {
  try {
    const roomType = await roomTypeService.createRoomType(req.body);
    return res.status(201).json({ message: 'Thêm loại phòng thành công.', roomType });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    if (error.number === 2601 || error.number === 2627) {
      return res.status(409).json({ message: 'Tên loại phòng đã tồn tại.' });
    }
    console.error('Create room type error:', error);
    return res.status(500).json({ message: 'Không thể thêm loại phòng.' });
  }
}

async function updateRoomType(req, res) {
  const roomTypeId = Number(req.params.roomTypeId);
  try {
    const roomType = await roomTypeService.updateRoomType(roomTypeId, req.body);
    if (!roomType) return res.status(404).json({ message: 'Không tìm thấy loại phòng.' });
    return res.json({ message: 'Cập nhật loại phòng thành công.', roomType });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error('Update room type error:', error);
    return res.status(500).json({ message: 'Không thể cập nhật loại phòng.' });
  }
}

async function deleteRoomType(req, res) {
  const roomTypeId = Number(req.params.roomTypeId);
  try {
    const result = await roomTypeService.deleteRoomType(roomTypeId);
    if (result.kind === 'NOT_FOUND') return res.status(404).json({ message: 'Không tìm thấy loại phòng.' });
    if (result.kind === 'IN_USE') {
      const { roomType } = result;
      const reasons = [];
      if (Number(roomType.room_count) > 0) reasons.push(`${roomType.room_count} phòng vật lý`);
      if (Number(roomType.review_count) > 0) reasons.push(`${roomType.review_count} đánh giá`);
      return res.status(409).json({ message: `Không thể xóa “${roomType.room_type_name}” vì còn ${reasons.join(' và ')} liên quan.` });
    }
    return res.json({ message: `Đã xóa loại phòng “${result.roomType.room_type_name}”.` });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    if (error.number === 547) return res.status(409).json({ message: 'Không thể xóa loại phòng vì vẫn còn dữ liệu liên quan.' });
    console.error('Delete room type error:', error);
    return res.status(500).json({ message: 'Không thể xóa loại phòng.' });
  }
}

async function getRoomTypeImage(req, res) {
  const roomTypeId = Number(req.params.roomTypeId);
  if (!Number.isInteger(roomTypeId) || roomTypeId < 1) {
    return res.status(400).json({ message: 'Mã loại phòng không hợp lệ.' });
  }
  try {
    const image = await roomTypeService.getPrimaryImage(roomTypeId);
    if (!image) return res.status(404).json({ message: 'Loại phòng chưa có ảnh.' });
    if (image.image_data) {
      res.set('Content-Type', image.mime_type || 'application/octet-stream');
      res.set('Cache-Control', 'no-store');
      return res.send(image.image_data);
    }
    if (image.image_url && !image.image_url.includes('/api/room-types/')) {
      if (image.image_url.includes('/uploads/')) {
        const legacyFileName = path.basename(new URL(image.image_url).pathname);
        const legacyFilePath = path.resolve(uploadsDir, legacyFileName);
        if (legacyFilePath.startsWith(`${path.resolve(uploadsDir)}${path.sep}`) && fs.existsSync(legacyFilePath)) {
          return res.redirect(`/uploads/${encodeURIComponent(legacyFileName)}`);
        }
      }
      return res.redirect(image.image_url);
    }
    return res.status(404).json({ message: 'Không tìm thấy dữ liệu ảnh.' });
  } catch (error) {
    console.error('Read room image error:', error);
    return res.status(500).json({ message: 'Không thể tải ảnh loại phòng.' });
  }
}

async function uploadRoomTypeImage(req, res) {
  const roomTypeId = Number(req.params.roomTypeId);
  const imageFile = req.file;
  if (!imageFile) return res.status(400).json({ message: 'Thiếu file ảnh.' });
  if (!Number.isInteger(roomTypeId) || roomTypeId < 1) {
    return res.status(400).json({ message: 'Mã loại phòng không hợp lệ.' });
  }
  try {
    const imageUrl = `${req.protocol}://${req.get('host')}/api/room-types/${roomTypeId}/image`;
    const saved = await roomTypeService.savePrimaryImage(roomTypeId, imageUrl, imageFile);
    if (!saved) return res.status(404).json({ message: 'Không tìm thấy loại phòng.' });
    return res.status(201).json({ message: 'Upload ảnh phòng thành công.', roomTypeId, image_url: imageUrl });
  } catch (error) {
    console.error('Upload room image error:', error);
    return res.status(500).json({ message: 'Upload ảnh thất bại.', error: error.message });
  }
}

module.exports = { createRoomType, updateRoomType, deleteRoomType, getRoomTypeImage, uploadRoomTypeImage };
