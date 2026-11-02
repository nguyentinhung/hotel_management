function toUpdateRoomStatusRequest(body = {}) { return { status: body?.status, current_status: body?.current_status }; }
module.exports = { toUpdateRoomStatusRequest };
