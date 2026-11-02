function toEquipmentAssetsResponse(assets) { return assets.map((asset) => ({ id: asset.id, equipment_item_id: asset.equipment_item_id, asset_code: asset.asset_code, serial_number: asset.serial_number, status: asset.status, purchase_date: asset.purchase_date, notes: asset.notes, current_room_name: asset.current_room_name })); }
module.exports = { toEquipmentAssetsResponse };
