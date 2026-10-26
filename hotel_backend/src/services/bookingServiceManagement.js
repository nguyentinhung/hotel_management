const bookingServiceDao = require('../dao/bookingServiceDao');
const BookingServiceModel = require('../models/bookingServiceModel');

class BookingServiceManagementError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function assertBookingId(value) {
  if (!/^\d+$/.test(String(value)) || BigInt(value) <= 0n) {
    throw new BookingServiceManagementError('INVALID_BOOKING_ID');
  }
}

async function getServiceableBookingRooms(bookingId, customerId = null) {
  assertBookingId(bookingId);
  return BookingServiceModel.fromResult(await bookingServiceDao.getServiceableBookingRooms(bookingId, customerId));
}

async function getBookingServices(bookingId, customerId = null) {
  assertBookingId(bookingId);
  return BookingServiceModel.fromResult(await bookingServiceDao.getBookingServices(bookingId, customerId));
}

async function addServiceToCheckedInBooking(input) {
  assertBookingId(input.bookingId);
  let selection;
  try { selection = BookingServiceModel.normalizeUsageInput(input); }
  catch (error) { throw new BookingServiceManagementError(error.code || 'INVALID_SELECTION'); }

  try {
    return BookingServiceModel.fromResult(await bookingServiceDao.addServiceToCheckedInBooking({ ...input, ...selection }));
  } catch (error) {
    if (/not configured for on-demand/i.test(error.message)) {
      throw new BookingServiceManagementError('SERVICE_POLICY');
    }
    if (/not found, or booking is not checked in/i.test(error.message)) {
      throw new BookingServiceManagementError('BOOKING_NOT_SERVICEABLE');
    }
    throw error;
  }
}

module.exports = {
  getServiceableBookingRooms,
  getBookingServices,
  addServiceToCheckedInBooking,
  BookingServiceManagementError,
};
