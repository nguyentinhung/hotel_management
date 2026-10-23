const BaseModel = require('./baseModel');

class PromotionModel extends BaseModel {
  static normalizeInput(input) {
    if (!input || typeof input.code !== 'string' || !input.code.trim()) throw new Error('Promotion code is required.');
    if (typeof input.name !== 'string' || !input.name.trim()) throw new Error('Promotion name is required.');
    if (!['PERCENT', 'FIXED_AMOUNT'].includes(input.discount_type)) {
      throw new Error('Promotion discount type must be PERCENT or FIXED_AMOUNT.');
    }
    const discountValue = Number(input.discount_value);
    if (!Number.isFinite(discountValue) || discountValue <= 0) throw new Error('Promotion discount value must be greater than 0.');
    if (input.discount_type === 'PERCENT' && discountValue > 100) throw new Error('Promotion percent discount cannot exceed 100.');
    if (input.max_discount != null && input.max_discount !== ''
      && (!Number.isFinite(Number(input.max_discount)) || Number(input.max_discount) < 0)) {
      throw new Error('Promotion max discount is invalid.');
    }
    if (!input.valid_from || !input.valid_to || String(input.valid_from) > String(input.valid_to)) {
      throw new Error('Promotion valid time is invalid.');
    }
    if (input.description != null && typeof input.description !== 'string') throw new Error('Promotion description must be text.');
    return {
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      description: input.description ? input.description.trim() : '',
      discount_type: input.discount_type,
      discount_value: discountValue,
      max_discount: input.max_discount == null || input.max_discount === '' ? null : Number(input.max_discount),
      valid_from: String(input.valid_from).slice(0, 10),
      valid_to: String(input.valid_to).slice(0, 10),
      is_active: input.is_active !== false,
    };
  }

  static calculateDiscount(promotion, subtotal) {
    const amount = Number(subtotal);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Tổng booking không hợp lệ.');
    let discount = promotion.discount_type === 'PERCENT'
      ? Math.floor(amount * Number(promotion.discount_value) / 100)
      : Number(promotion.discount_value);
    if (promotion.max_discount != null) discount = Math.min(discount, Number(promotion.max_discount));
    discount = Math.max(0, Math.min(amount, discount));
    return { discount, total: amount - discount };
  }

  static get schema() {
    return {
      name: 'PromotionModel', table: 'promotions', primaryKey: 'id',
      fields: ['id', 'code', 'name', 'discount_type', 'discount_value', 'max_discount', 'valid_from', 'valid_to', 'is_active'],
    };
  }
}

module.exports = PromotionModel;
