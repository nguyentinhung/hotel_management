function toUpdateBookingResponse(data) { return { success: data.success, message: data.message, booking: data.booking }; }
module.exports = { toUpdateBookingResponse };
