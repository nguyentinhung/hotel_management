function toPromotionListResponse(promotions) { return promotions.map((promotion) => ({ ...promotion })); }
module.exports = { toPromotionListResponse };
