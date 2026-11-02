function toCheckRoomAvailabilityRequest(query = {}) { return { check_in_date: query?.check_in_date, check_out_date: query?.check_out_date, adults: query?.adults, children: query?.children, exclude_booking_id: query?.exclude_booking_id }; }
module.exports = { toCheckRoomAvailabilityRequest };
