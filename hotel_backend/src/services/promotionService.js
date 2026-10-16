const promotionDao = require('../dao/promotionDao');

function normalizePromotion(data) {
  if (!data || typeof data.code !== 'string' || !data.code.trim()) {
    throw new Error('Promotion code is required.');
  }
  if (typeof data.name !== 'string' || !data.name.trim()) {
    throw new Error('Promotion name is required.');
  }
  if (!['PERCENT', 'FIXED_AMOUNT'].includes(data.discount_type)) {
    throw new Error('Promotion discount type must be PERCENT or FIXED_AMOUNT.');
  }
  if (!Number.isFinite(Number(data.discount_value)) || Number(data.discount_value) <= 0) {
    throw new Error('Promotion discount value must be greater than 0.');
  }
  if (data.discount_type === 'PERCENT' && Number(data.discount_value) > 100) {
    throw new Error('Promotion percent discount cannot exceed 100.');
  }
  if (data.max_discount != null && data.max_discount !== '' && (!Number.isFinite(Number(data.max_discount)) || Number(data.max_discount) < 0)) {
    throw new Error('Promotion max discount is invalid.');
  }
  if (!data.valid_from || !data.valid_to || String(data.valid_from) > String(data.valid_to)) {
    throw new Error('Promotion valid time is invalid.');
  }
  if (data.description != null && typeof data.description !== 'string') {
    throw new Error('Promotion description must be text.');
  }

  return {
    code: data.code.trim().toUpperCase(),
    name: data.name.trim(),
    description: data.description ? data.description.trim() : '',
    discount_type: data.discount_type,
    discount_value: Number(data.discount_value),
    max_discount: data.max_discount == null || data.max_discount === '' ? null : Number(data.max_discount),
    valid_from: String(data.valid_from).slice(0, 10),
    valid_to: String(data.valid_to).slice(0, 10),
    is_active: data.is_active !== false
  };
}

async function getAllPromotions() {
  return promotionDao.findAll();
}

async function getActivePromotions() {
  return promotionDao.findActive();
}

async function validatePromotion(code, subtotal) {
  const normalizedCode = String(code || '').trim().toUpperCase();
  if (!normalizedCode) throw new Error('Vui lòng nhập mã khuyến mãi.');
  const promotion = await promotionDao.findActiveByCode(normalizedCode);
  if (!promotion) throw new Error('Mã khuyến mãi không hợp lệ, chưa hoạt động hoặc đã hết hạn.');
  const amount = Number(subtotal);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Tổng booking không hợp lệ.');
  let discount = promotion.discount_type === 'PERCENT'
    ? Math.floor(amount * Number(promotion.discount_value) / 100)
    : Number(promotion.discount_value);
  if (promotion.max_discount != null) discount = Math.min(discount, Number(promotion.max_discount));
  discount = Math.max(0, Math.min(amount, discount));
  return {
    promotion_id: promotion.id,
    promotion_code: promotion.code,
    discount_type: promotion.discount_type,
    discount_value: Number(promotion.discount_value),
    max_discount: promotion.max_discount == null ? null : Number(promotion.max_discount),
    discount_amount: discount,
    original_total: amount,
    total_amount: amount - discount,
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
  const promotion = normalizePromotion(data);
  const existing = await promotionDao.findByCode(promotion.code);
  if (existing) {
    throw new Error('Promotion code already exists.');
  }
  return promotionDao.create(promotion);
}

async function updatePromotion(id, data) {
  const existing = await promotionDao.findById(Number(id));
  if (!existing) {
    throw new Error('Promotion not found.');
  }

  const promotion = normalizePromotion(data);
  const duplicate = await promotionDao.findByCode(promotion.code, Number(id));
  if (duplicate) {
    throw new Error('Promotion code already exists.');
  }

  return promotionDao.update(Number(id), promotion);
}

async function deletePromotion(id) {
  const existing = await promotionDao.findById(Number(id));
  if (!existing) {
    throw new Error('Promotion not found.');
  }
  return promotionDao.remove(Number(id));
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
