function toUpdateRoomTypeRequest(body = {}) { return { name: body?.name, description: body?.description, base_price: body?.base_price, max_adults: body?.max_adults, max_children: body?.max_children, amenity_ids: body?.amenity_ids }; }
module.exports = { toUpdateRoomTypeRequest };
