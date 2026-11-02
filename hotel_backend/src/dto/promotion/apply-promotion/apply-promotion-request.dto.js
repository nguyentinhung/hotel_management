function toApplyPromotionRequest(body = {}) { return { code: body?.code, subtotal: body?.subtotal }; }
module.exports = { toApplyPromotionRequest };
