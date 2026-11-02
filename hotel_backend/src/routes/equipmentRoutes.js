const express = require('express');
const equipmentItemController = require('../controllers/equipmentItemController');
const equipmentAssetController = require('../controllers/equipmentAssetController');
const roomEquipmentAssignmentController = require('../controllers/roomEquipmentAssignmentController');
const { requireAdmin, requireRoomListAccess } = require('../middlewares/roleMiddleware');

const router = express.Router();

router.get('/admin/equipment-items', requireAdmin, equipmentItemController.getEquipmentItems);
router.get('/admin/equipment-items/:id', requireAdmin, equipmentItemController.getEquipmentItemById);
router.get('/admin/equipment-items/:id/rooms', requireAdmin, equipmentItemController.getEquipmentRooms);
router.put('/admin/equipment-items/:id/rooms', requireAdmin, equipmentItemController.assignEquipmentToRooms);
router.post('/admin/equipment-items', requireAdmin, equipmentItemController.createEquipmentItem);
router.put('/admin/equipment-items/:id', requireAdmin, equipmentItemController.updateEquipmentItem);
router.delete('/admin/equipment-items/:id', requireAdmin, equipmentItemController.deleteEquipmentItem);

router.get('/admin/equipment-items/:equipmentItemId/assets', requireAdmin, equipmentAssetController.getEquipmentAssets);
router.get('/admin/equipment-items/:equipmentItemId/assets/:assetId', requireAdmin, equipmentAssetController.getEquipmentAsset);
router.post('/admin/equipment-items/:equipmentItemId/assets', requireAdmin, equipmentAssetController.createEquipmentAsset);
router.put('/admin/equipment-items/:equipmentItemId/assets/:assetId', requireAdmin, equipmentAssetController.updateEquipmentAsset);
router.delete('/admin/equipment-items/:equipmentItemId/assets/:assetId', requireAdmin, equipmentAssetController.deleteEquipmentAsset);

router.get('/rooms/:roomId/equipment-assets', requireRoomListAccess, roomEquipmentAssignmentController.getRoomEquipment);
router.get('/rooms/:roomId/assignable-equipment-assets', requireRoomListAccess, roomEquipmentAssignmentController.getAssignableAssets);
router.post('/rooms/:roomId/equipment-assets', requireAdmin, roomEquipmentAssignmentController.assignEquipmentToRoom);
router.delete('/rooms/:roomId/equipment-assets/:equipmentAssetId', requireAdmin, roomEquipmentAssignmentController.unassignEquipmentFromRoom);

module.exports = router;
