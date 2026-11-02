function toAddServiceToInHouseBookingRequest(body = {}) { return { booking_room_id: body?.booking_room_id, service_id: body?.service_id, quantity: body?.quantity, items: body?.items }; }
module.exports = { toAddServiceToInHouseBookingRequest };
