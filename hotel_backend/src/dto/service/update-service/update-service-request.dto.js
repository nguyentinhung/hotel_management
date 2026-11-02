function toUpdateServiceRequest(body = {}) { return { name: body?.name, description: body?.description, price: body?.price, unit: body?.unit, is_active: body?.is_active, booking_policy: body?.booking_policy }; }
module.exports = { toUpdateServiceRequest };
