const promotionService = require('../services/promotionService');


async function getPromotions(req, res) {
  try {
    const promotions = await promotionService.getAllPromotions();
    return res.json(promotions);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getActivePromotions(req, res) {
  try {
    const promotions = await promotionService.getActivePromotions();
    return res.json(promotions);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function validatePromotion(req, res) {
  try {
    return res.json(await promotionService.validatePromotion(req.body?.code, req.body?.subtotal));
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

async function getPromotionById(req, res) {
  try {
    const activeOnly = req.baseUrl === '/api/promotions';
    const promotion = await promotionService.getPromotionById(req.params.id, activeOnly);
    return res.json(promotion);
  } catch (error) {
    return res.status(error.message === 'Promotion not found.' ? 404 : 500).json({ message: error.message });
  }
}

async function createPromotion(req, res) {
  try {
    const promotion = await promotionService.createPromotion(req.body);
    return res.status(201).json(promotion);
  } catch (error) {
    return res.status(error.message.includes('already exists') ? 409 : 400).json({ message: error.message });
  }
}

async function updatePromotion(req, res) {
  try {
    const promotion = await promotionService.updatePromotion(req.params.id, req.body);
    return res.json(promotion);
  } catch (error) {
    const status = error.message === 'Promotion not found.' ? 404 : error.message.includes('already exists') ? 409 : 400;
    return res.status(status).json({ message: error.message });
  }
}

async function deletePromotion(req, res) {
  try {
    await promotionService.deletePromotion(req.params.id);
    return res.json({ message: 'Promotion deleted successfully' });
  } catch (error) {
    return res.status(error.message === 'Promotion not found.' ? 404 : 500).json({ message: error.message });
  }
}

module.exports = {
  getPromotions,
  getActivePromotions,
  validatePromotion,
  getPromotionById,
  createPromotion,
  updatePromotion,
  deletePromotion
};
