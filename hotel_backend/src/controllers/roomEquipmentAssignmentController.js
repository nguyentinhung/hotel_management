const roomEquipmentAssignmentService = require('../services/roomEquipmentAssignmentService');

function sendError(res, error, genericMessage) {
  if ([400, 404, 409].includes(error.statusCode)) {
    return res.status(error.statusCode).json({ success: false, message: error.message });
  }
  console.error('Room equipment assignment request failed:', error);
  return res.status(500).json({ success: false, message: genericMessage });
}

async function getRoomEquipment(req, res) {
  try {
    const assignments = await roomEquipmentAssignmentService.getRoomAssignments(req.params.roomId);
    if (assignments === null) return res.status(404).json({ success: false, message: 'Room not found.' });
    return res.json({ success: true, assignments });
  } catch (error) {
    return sendError(res, error, 'Unable to load equipment assigned to this room.');
  }
}

async function getAssignableAssets(req, res) {
  try {
    const assets = await roomEquipmentAssignmentService.getAssignableAssets(req.params.roomId, req.query.equipment_item_id);
    if (assets === null) return res.status(404).json({ success: false, message: 'Room not found.' });
    return res.json({ success: true, assets });
  } catch (error) {
    return sendError(res, error, 'Unable to load equipment available for assignment.');
  }
}

async function assignEquipmentToRoom(req, res) {
  try {
    const assignment = await roomEquipmentAssignmentService.assignEquipmentToRoom(
      req.params.roomId,
      req.body?.equipment_asset_id,
      req.body?.equipment_item_id,
    );
    return res.status(201).json({
      success: true,
      message: 'Equipment assigned to room successfully.',
      assignment,
    });
  } catch (error) {
    return sendError(res, error, 'Unable to assign equipment to this room.');
  }
}

async function unassignEquipmentFromRoom(req, res) {
  try {
    await roomEquipmentAssignmentService.unassignEquipmentFromRoom(
      req.params.roomId,
      req.params.equipmentAssetId,
    );
    return res.json({ success: true, message: 'Đã gỡ thiết bị khỏi phòng thành công.' });
  } catch (error) {
    return sendError(res, error, 'Không thể gỡ thiết bị khỏi phòng.');
  }
}

module.exports = { getRoomEquipment, getAssignableAssets, assignEquipmentToRoom, unassignEquipmentFromRoom };
