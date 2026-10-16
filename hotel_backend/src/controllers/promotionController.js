const jwt = require('jsonwebtoken');
const promotionService = require('../services/promotionService');

const JWT_SECRET = process.env.JWT_SECRET || 'hotel-management-secret';
const roleCodeById = { 1: 'CUSTOMER', 2: 'RECEPTIONIST', 3: 'HOUSEKEEPER', 4: 'ADMIN' };

function requireAdmin(req, res, next) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return res.status(401).json({ message: 'Vui long dang nhap de tiep tuc.' });

  try {
    const claims = jwt.verify(token, JWT_SECRET);
    const roleCode = roleCodeById[Number(claims.role_id)] || String(claims.role_code || '').toUpperCase();
    if (roleCode !== 'ADMIN') {
      return res.status(403).json({ message: 'Chi quan tri vien duoc quan ly khuyen mai.' });
    }
    return next();
  } catch {
    return res.status(401).json({ message: 'Phien dang nhap khong hop le hoac da het han.' });
  }
}

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
  requireAdmin,
  getPromotions,
  getActivePromotions,
  validatePromotion,
  getPromotionById,
  createPromotion,
  updatePromotion,
  deletePromotion
};
