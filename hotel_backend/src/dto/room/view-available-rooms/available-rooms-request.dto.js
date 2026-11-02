function toAvailableRoomsRequest(query = {}) { return { room_type_id: query?.room_type_id, check_in_date: query?.check_in_date, check_out_date: query?.check_out_date }; }
module.exports = { toAvailableRoomsRequest };
