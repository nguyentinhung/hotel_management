function toCheckRoomAvailabilityItem({ type, totalRooms, bookedRooms, availableCount, capacityMatched, availableRoomNumbers }) {
  return {
    id: type.id,
    name: type.name,
    description: type.description,
    base_price: Number(type.base_price ?? 0),
    max_adults: type.max_adults ?? 0,
    max_children: type.max_children ?? 0,
    image_url: type.image_url || null,
    amenities: String(type.amenities || '').split(',').map((entry) => entry.trim()).filter(Boolean),
    average_rating: Number((type.average_rating ?? 0).toFixed(1)),
    review_count: Number(type.review_count ?? 0),
    total_rooms: totalRooms,
    booked_rooms: bookedRooms,
    available_rooms: availableCount,
    is_available: availableCount > 0,
    capacity_matched: capacityMatched,
    available_room_list: availableRoomNumbers,
  };
}

function toCheckRoomAvailabilityResponse({ checkInDate, checkOutDate, adults, children, availabilityList }) {
  return { success: true, check_in_date: checkInDate, check_out_date: checkOutDate, adults, children, total_types: availabilityList.length, available_types: availabilityList.filter((item) => item.is_available).length, data: availabilityList };
}
module.exports = { toCheckRoomAvailabilityItem, toCheckRoomAvailabilityResponse };
