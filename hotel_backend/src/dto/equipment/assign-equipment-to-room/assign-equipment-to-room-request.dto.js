function toAssignEquipmentToRoomRequest(body = {}) { return { equipment_asset_id: body?.equipment_asset_id, equipment_item_id: body?.equipment_item_id }; }
module.exports = { toAssignEquipmentToRoomRequest };
