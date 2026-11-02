function toAddPromotionRequest(body = {}) { return { code: body?.code, name: body?.name, description: body?.description, discount_type: body?.discount_type, discount_value: body?.discount_value, max_discount: body?.max_discount, valid_from: body?.valid_from, valid_to: body?.valid_to, is_active: body?.is_active }; }
module.exports = { toAddPromotionRequest };
