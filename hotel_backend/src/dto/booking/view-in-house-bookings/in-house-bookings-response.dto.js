function toInHouseBookingsResponse(bookings) { return { success: true, count: bookings.length, bookings }; }
module.exports = { toInHouseBookingsResponse };
