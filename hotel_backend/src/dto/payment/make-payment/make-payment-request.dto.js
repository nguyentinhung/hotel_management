function toMakePaymentRequest(body = {}) { return { booking_code: body?.booking_code, payment_type: body?.payment_type, method: body?.method }; }
module.exports = { toMakePaymentRequest };
