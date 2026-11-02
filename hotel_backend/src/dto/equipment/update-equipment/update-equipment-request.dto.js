function toUpdateEquipmentRequest(body = {}) { return { name: body?.name, description: body?.description, is_active: body?.is_active, unit_price: body?.unit_price }; }
module.exports = { toUpdateEquipmentRequest };
