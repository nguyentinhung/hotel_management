function toAssignRoomResponse(data) { return { success: data.success, message: data.message, assignment: data.assignment }; }
module.exports = { toAssignRoomResponse };
