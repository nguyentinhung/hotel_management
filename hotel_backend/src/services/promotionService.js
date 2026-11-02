const promotionDao = require('../dao/promotionDao');

function normalizePromotionInput(input) {
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

function calculateDiscount(promotion, subtotal) {
  const amount = Number(subtotal);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Tổng booking không hợp lệ.');
  let discount = promotion.discount_type === 'PERCENT'
    ? Math.floor(amount * Number(promotion.discount_value) / 100)
    : Number(promotion.discount_value);
  if (promotion.max_discount != null) discount = Math.min(discount, Number(promotion.max_discount));
  discount = Math.max(0, Math.min(amount, discount));
  return { discount, total: amount - discount };
}


async function getAllPromotions() {
  return await promotionDao.findAll();
}

async function getActivePromotions() {
  return await promotionDao.findActive();
}

async function validatePromotion(code, subtotal) {
  const normalizedCode = String(code || '').trim().toUpperCase();
  if (!normalizedCode) throw new Error('Vui l�ng nh?p m� khuy?n m�i.');
  const promotion = await promotionDao.findActiveByCode(normalizedCode);
  if (!promotion) throw new Error('M� khuy?n m�i kh�ng h?p l?, chua ho?t d?ng ho?c d� h?t h?n.');
  const { discount, total } = calculateDiscount(promotion, subtotal);
  return {
    promotion_id: promotion.id,
    promotion_code: promotion.code,
    discount_type: promotion.discount_type,
    discount_value: Number(promotion.discount_value),
    max_discount: promotion.max_discount == null ? null : Number(promotion.max_discount),
    discount_amount: discount,
    original_total: Number(subtotal),
    total_amount: total,
  };
}

async function getPromotionById(id, activeOnly = false) {
  const promotion = await promotionDao.findById(Number(id), activeOnly);
  if (!promotion) {
    throw new Error('Promotion not found.');
  }
  return promotion;
}

async function createPromotion(data) {
  const promotion = normalizePromotionInput(data);
  const existing = await promotionDao.findByCode(promotion.code);
  if (existing) {
    throw new Error('Promotion code already exists.');
  }
  return await promotionDao.create(promotion);
}

async function updatePromotion(id, data) {
  const existing = await promotionDao.findById(Number(id));
  if (!existing) {
    throw new Error('Promotion not found.');
  }

  const promotion = normalizePromotionInput(data);
  const duplicate = await promotionDao.findByCode(promotion.code, Number(id));
  if (duplicate) {
    throw new Error('Promotion code already exists.');
  }

  return await promotionDao.update(Number(id), promotion);
}

async function deletePromotion(id) {
  const existing = await promotionDao.findById(Number(id));
  if (!existing) {
    throw new Error('Promotion not found.');
  }
  return await promotionDao.remove(Number(id));
}

module.exports = {
  getAllPromotions,
  getActivePromotions,
  validatePromotion,
  getPromotionById,
  createPromotion,
  updatePromotion,
  deletePromotion
};
