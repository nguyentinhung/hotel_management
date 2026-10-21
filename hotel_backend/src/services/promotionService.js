const promotionDao = require('../dao/promotionDao');
const PromotionModel = require('../models/promotionModel');



async function getAllPromotions() {
  return promotionDao.findAll();
}

async function getActivePromotions() {
  return promotionDao.findActive();
}

async function validatePromotion(code, subtotal) {
  const normalizedCode = String(code || '').trim().toUpperCase();
  if (!normalizedCode) throw new Error('Vui l�ng nh?p m� khuy?n m�i.');
  const promotion = await promotionDao.findActiveByCode(normalizedCode);
  if (!promotion) throw new Error('M� khuy?n m�i kh�ng h?p l?, chua ho?t d?ng ho?c d� h?t h?n.');
  const { discount, total } = PromotionModel.calculateDiscount(promotion, subtotal);
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
  const promotion = PromotionModel.normalizeInput(data);
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

  const promotion = PromotionModel.normalizeInput(data);
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
