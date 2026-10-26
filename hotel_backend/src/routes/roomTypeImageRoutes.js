const express = require('express');
const roomTypeController = require('../controllers/roomTypeController');
const { requireAdmin } = require('../middlewares/roleMiddleware');
const { uploadRoomTypeImage } = require('../middlewares/upload');

const router = express.Router();
router.get('/room-types/:roomTypeId/image', roomTypeController.getRoomTypeImage);
router.post('/room-types/:roomTypeId/image', requireAdmin, uploadRoomTypeImage, roomTypeController.uploadRoomTypeImage);

module.exports = router;
