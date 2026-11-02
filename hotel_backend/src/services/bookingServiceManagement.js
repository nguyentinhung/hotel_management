const bookingServiceDao = require('../dao/bookingServiceDao');

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

function normalizeUsageInput(input = {}) {
  const bookingRoomId = Number(input.bookingRoomId);
  const serviceId = Number(input.serviceId);
  const quantity = Number(input.quantity);
  if (!Number.isSafeInteger(bookingRoomId) || bookingRoomId < 1
    || !Number.isInteger(serviceId) || serviceId < 1
    || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    throw Object.assign(new Error('Invalid booking service selection.'), { code: 'INVALID_SELECTION' });
  }
  return { bookingRoomId, serviceId, quantity };
}

async function getServiceableBookingRooms(bookingId, customerId = null) {
  assertBookingId(bookingId);
  return await bookingServiceDao.getServiceableBookingRooms(bookingId, customerId);
}

async function getBookingServices(bookingId, customerId = null) {
  assertBookingId(bookingId);
  return await bookingServiceDao.getBookingServices(bookingId, customerId);
}

async function addServiceToCheckedInBooking(input) {
  assertBookingId(input.bookingId);
  const sourceItems = Array.isArray(input.items) ? input.items : [input];
  if (!sourceItems.length || sourceItems.length > 50) throw new BookingServiceManagementError('INVALID_SELECTION');
  const items = new Map();
  try {
    for (const raw of sourceItems) {
      const selection = normalizeUsageInput({
        bookingRoomId: raw.booking_room_id ?? raw.bookingRoomId,
        serviceId: raw.service_id ?? raw.serviceId,
        quantity: raw.quantity,
      });
      const key = `${selection.bookingRoomId}:${selection.serviceId}`;
      const previous = items.get(key);
      const combinedQuantity = (previous?.quantity || 0) + selection.quantity;
      if (combinedQuantity > 100) throw new BookingServiceManagementError('INVALID_SELECTION');
      items.set(key, { ...selection, quantity: combinedQuantity });
    }
  } catch (error) {
    throw new BookingServiceManagementError(error.code || 'INVALID_SELECTION');
  }

  try {
    return await bookingServiceDao.addServiceToCheckedInBooking({
      bookingId: input.bookingId,
      customerId: input.customerId,
      items: [...items.values()],
    });
  } catch (error) {
    if (error.code === 'BOOKING_NOT_SERVICEABLE') throw new BookingServiceManagementError(error.code);
    if (error.code === 'INVALID_SERVICEABLE_SELECTION') throw new BookingServiceManagementError(error.code);
    if (error.code === 'INVOICE_ALREADY_ISSUED') throw new BookingServiceManagementError(error.code);
    throw error;
  }
}

module.exports = {
  getServiceableBookingRooms,
  getBookingServices,
  addServiceToCheckedInBooking,
  BookingServiceManagementError,
};
