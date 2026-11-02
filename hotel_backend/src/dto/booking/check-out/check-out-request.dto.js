function toCheckOutRequest(body = {}) { return { payment_method: body?.payment_method }; }
module.exports = { toCheckOutRequest };
