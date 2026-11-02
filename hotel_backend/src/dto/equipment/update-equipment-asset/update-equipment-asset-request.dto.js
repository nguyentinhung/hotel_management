function toUpdateEquipmentAssetRequest(body = {}) { return { asset_code: body?.asset_code, serial_number: body?.serial_number, status: body?.status, purchase_date: body?.purchase_date, notes: body?.notes }; }
module.exports = { toUpdateEquipmentAssetRequest };
