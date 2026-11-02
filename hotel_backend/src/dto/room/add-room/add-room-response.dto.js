function toAddRoomResponse(result) { return { success: true, message: 'Thêm phòng thành công.', room: result.room }; }
module.exports = { toAddRoomResponse };
