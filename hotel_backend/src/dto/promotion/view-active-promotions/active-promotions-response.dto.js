function toActivePromotionsResponse(promotions) { return promotions.map((promotion) => ({ ...promotion })); }
module.exports = { toActivePromotionsResponse };
