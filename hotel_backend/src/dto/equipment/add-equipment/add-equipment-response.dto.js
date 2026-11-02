function toAddEquipmentResponse(item) { return { id: item.id, name: item.name, description: item.description, is_active: item.is_active, unit_price: Number(item.unit_price ?? 0), asset_count: Number(item.asset_count ?? 0) }; }
module.exports = { toAddEquipmentResponse };
