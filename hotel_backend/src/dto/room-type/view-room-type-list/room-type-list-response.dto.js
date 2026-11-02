function parseAmenityIds(value) {
  return String(value ?? '').split(',').map((part) => part.trim()).filter(Boolean).map(Number).filter((id) => Number.isInteger(id) && id > 0);
}

function toRoomTypeListResponse(items) {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    base_price: Number(item.base_price ?? 0),
    max_adults: item.max_adults ?? 0,
    max_children: item.max_children ?? 0,
    amenities: String(item.amenities || '').split(',').map((entry) => entry.trim()).filter(Boolean),
    amenity_ids: parseAmenityIds(item.amenity_ids),
    image_url: item.image_url || null,
    average_rating: Number((item.average_rating ?? 0).toFixed(1)),
    review_count: Number(item.review_count ?? 0),
  }));
}

module.exports = { toRoomTypeListResponse };
