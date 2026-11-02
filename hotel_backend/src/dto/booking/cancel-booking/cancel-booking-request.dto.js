function toCancelBookingRequest(body = {}) { return { cancellation_reason_note: body?.cancellation_reason_note }; }
module.exports = { toCancelBookingRequest };
