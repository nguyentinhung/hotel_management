const promotionService = require('../services/promotionService');
const { toApplyPromotionRequest } = require('../dto/promotion/apply-promotion/apply-promotion-request.dto');
const { toAddPromotionRequest } = require('../dto/promotion/add-promotion/add-promotion-request.dto');
const { toUpdatePromotionRequest } = require('../dto/promotion/update-promotion/update-promotion-request.dto');
const { toPromotionListResponse } = require('../dto/promotion/view-promotion-list/promotion-list-response.dto');
const { toActivePromotionsResponse } = require('../dto/promotion/view-active-promotions/active-promotions-response.dto');
const { toPromotionDetailsResponse } = require('../dto/promotion/view-promotion-details/promotion-details-response.dto');
const { toApplyPromotionResponse } = require('../dto/promotion/apply-promotion/apply-promotion-response.dto');
const { toAddPromotionResponse } = require('../dto/promotion/add-promotion/add-promotion-response.dto');
const { toUpdatePromotionResponse } = require('../dto/promotion/update-promotion/update-promotion-response.dto');
const { toDeletePromotionResponse } = require('../dto/promotion/delete-promotion/delete-promotion-response.dto');


async function getPromotions(req, res) {
  try {
    const promotions = await promotionService.getAllPromotions();
    return res.json(toPromotionListResponse(promotions));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getActivePromotions(req, res) {
  try {
    const promotions = await promotionService.getActivePromotions();
    return res.json(toActivePromotionsResponse(promotions));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function validatePromotion(req, res) {
  try {
    const { code, subtotal } = toApplyPromotionRequest(req.body);
    return res.json(toApplyPromotionResponse(await promotionService.validatePromotion(code, subtotal)));
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

async function getPromotionById(req, res) {
  try {
    const promotion = await promotionService.getPromotionById(req.params.id, false);
    return res.json(toPromotionDetailsResponse(promotion));
  } catch (error) {
    return res.status(error.message === 'Promotion not found.' ? 404 : 500).json({ message: error.message });
  }
}

async function createPromotion(req, res) {
  try {
    const promotion = await promotionService.createPromotion(toAddPromotionRequest(req.body));
    return res.status(201).json(toAddPromotionResponse(promotion));
  } catch (error) {
    return res.status(error.message.includes('already exists') ? 409 : 400).json({ message: error.message });
  }
}

async function updatePromotion(req, res) {
  try {
    const promotion = await promotionService.updatePromotion(req.params.id, toUpdatePromotionRequest(req.body));
    return res.json(toUpdatePromotionResponse(promotion));
  } catch (error) {
    const status = error.message === 'Promotion not found.' ? 404 : error.message.includes('already exists') ? 409 : 400;
    return res.status(status).json({ message: error.message });
  }
}

async function deletePromotion(req, res) {
  try {
    await promotionService.deletePromotion(req.params.id);
    return res.json(toDeletePromotionResponse());
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
