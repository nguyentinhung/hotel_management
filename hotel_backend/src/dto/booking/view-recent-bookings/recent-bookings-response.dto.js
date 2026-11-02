function toRecentBookingsResponse(bookings) { return { success: true, count: bookings.length, bookings }; }
module.exports = { toRecentBookingsResponse };
