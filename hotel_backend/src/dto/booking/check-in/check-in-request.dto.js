function toCheckInRequest(body = {}) { return { room_assignments: body?.room_assignments }; }
module.exports = { toCheckInRequest };
