function toAddRoomRequest(body = {}) { return { room_number: body?.room_number, room_type_id: body?.room_type_id, floor: body?.floor }; }
module.exports = { toAddRoomRequest };
