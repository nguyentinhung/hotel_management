function toReceptionBookingHistoryResponse(bookings) { return { success: true, count: bookings.length, bookings }; }
module.exports = { toReceptionBookingHistoryResponse };
