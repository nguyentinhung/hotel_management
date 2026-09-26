const { getRoomTypes, getPromotions, getServices, getReviews } = require('../dao/homeDao');

function toNumber(value) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function normalizeRoomTypes(rawList) {
  return rawList.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    base_price: toNumber(item.base_price),
    max_adults: item.max_adults ?? 0,
    max_children: item.max_children ?? 0,
    amenities: Array.isArray(item.amenities)
      ? item.amenities
      : String(item.amenities || '')
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean),
    image_url: item.image_url || null,
    average_rating: Number((item.average_rating ?? 0).toFixed(1)),
    review_count: Number(item.review_count ?? 0),
  }));
}

function normalizePromotions(rawList) {
  return rawList.map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    description: item.description,
    discount_type: item.discount_type,
    discount_value: toNumber(item.discount_value),
    max_discount: item.max_discount == null ? null : toNumber(item.max_discount),
    valid_from: item.valid_from,
    valid_to: item.valid_to,
    is_active: Boolean(item.is_active),
  }));
}

function normalizeServices(rawList) {
  return rawList.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    price: toNumber(item.price),
    unit: item.unit,
    is_active: Boolean(item.is_active),
  }));
}

function normalizeReviews(rawList) {
  return rawList.map((item) => ({
    id: item.id,
    room_type_id: item.room_type_id,
    customer_name: item.customer_name,
    rating: Number(item.rating ?? 0),
    comment: item.comment,
    is_hidden: Boolean(item.is_hidden),
    room_type_name: item.room_type_name,
  }));
}

async function fetchHomeData() {
  const [roomTypes, promotions, services, reviews] = await Promise.all([
    getRoomTypes(),
    getPromotions(),
    getServices(true),
    getReviews(),
  ]);

  return {
    roomTypes: normalizeRoomTypes(roomTypes),
    promotions: normalizePromotions(promotions),
    services: normalizeServices(services),
    reviews: normalizeReviews(reviews),
  };
}

module.exports = {
  fetchHomeData,
};
