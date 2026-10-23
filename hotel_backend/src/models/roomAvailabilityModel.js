const BaseModel = require('./baseModel');
const RoomModel = require('./roomModel');

/** Read projection returned by availability queries, with one object per room type. */
class RoomAvailabilityModel extends BaseModel {
  static fromAvailability({ type, totalRooms, bookedRooms, availableCount, capacityMatched, availableRoomNumbers }) {
    return new this({
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
      available_room_list: RoomModel.fromRows(availableRoomNumbers),
    });
  }

  static get schema() {
    return {
      name: 'RoomAvailabilityModel', table: null, primaryKey: null,
      fields: ['id', 'name', 'description', 'base_price', 'max_adults', 'max_children', 'image_url',
        'amenities', 'average_rating', 'review_count', 'total_rooms', 'booked_rooms',
        'available_rooms', 'is_available', 'capacity_matched', 'available_room_list'],
    };
  }
}

module.exports = RoomAvailabilityModel;
