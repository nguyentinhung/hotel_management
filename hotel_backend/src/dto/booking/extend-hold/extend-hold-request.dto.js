function toExtendHoldRequest(body = {}) { return { expected_arrival_at: body?.expected_arrival_at, reason: body?.reason }; }
module.exports = { toExtendHoldRequest };
