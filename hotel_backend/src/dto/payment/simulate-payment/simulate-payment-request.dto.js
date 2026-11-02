function toSimulatePaymentRequest(body = {}) { return { succeeded: body?.succeeded }; }
module.exports = { toSimulatePaymentRequest };
