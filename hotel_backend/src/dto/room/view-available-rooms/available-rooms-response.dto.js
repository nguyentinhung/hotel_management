function toAvailableRoomsResponse(roomTypeId, rooms) { return { success: true, room_type_id: Number(roomTypeId), count: rooms.length, rooms }; }
module.exports = { toAvailableRoomsResponse };
