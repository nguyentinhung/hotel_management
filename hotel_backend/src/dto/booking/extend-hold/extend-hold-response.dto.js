function toExtendHoldResponse(data) { return { success: data.success, message: data.message, hold: data.hold }; }
module.exports = { toExtendHoldResponse };
