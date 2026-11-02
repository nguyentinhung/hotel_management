function toCustomerBookingHistoryResponse(bookings) { return { success: true, count: bookings.length, bookings }; }
module.exports = { toCustomerBookingHistoryResponse };
