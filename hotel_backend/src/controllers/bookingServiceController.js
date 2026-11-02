const bookingServiceManagement = require('../services/bookingServiceManagement');
const { toAddServiceToInHouseBookingRequest } = require('../dto/booking-service/add-service-to-in-house-booking/add-service-request.dto');
const { toAddServiceToInHouseBookingResponse } = require('../dto/booking-service/add-service-to-in-house-booking/add-service-response.dto');

async function getBookingServiceData(req, res) {
  try {
    const [rooms, services] = await Promise.all([
      bookingServiceManagement.getServiceableBookingRooms(req.params.bookingId, req.bookingServiceCustomerId),
      bookingServiceManagement.getBookingServices(req.params.bookingId, req.bookingServiceCustomerId),
    ]);
    return res.json({ rooms, services });
  } catch (error) {
    if (error.code === 'INVALID_BOOKING_ID') return res.status(400).json({ message: 'M\u00e3 booking kh\u00f4ng h\u1ee3p l\u1ec7.' });
    console.error('Get booking services error:', error);
    return res.status(500).json({ message: 'Kh\u00f4ng th\u1ec3 t\u1ea3i d\u1ecbch v\u1ee5 trong booking.' });
  }
}

async function addBookingService(req, res) {
  try {
    const { booking_room_id: bookingRoomId, service_id: serviceId, quantity, items } = toAddServiceToInHouseBookingRequest(req.body);
    const service = await bookingServiceManagement.addServiceToCheckedInBooking({
      bookingId: req.params.bookingId,
      bookingRoomId,
      serviceId,
      quantity,
      items,
      customerId: req.bookingServiceCustomerId,
    });
    return res.status(201).json(toAddServiceToInHouseBookingResponse(service));
  } catch (error) {
    if (error.code === 'INVALID_BOOKING_ID') return res.status(400).json({ message: 'M\u00e3 booking kh\u00f4ng h\u1ee3p l\u1ec7.' });
    if (error.code === 'INVALID_SELECTION') {
      return res.status(400).json({ message: 'Vui l\u00f2ng ch\u1ecdn ph\u00f2ng, d\u1ecbch v\u1ee5 v\u00e0 s\u1ed1 l\u01b0\u1ee3ng h\u1ee3p l\u1ec7 (1\u2013100).' });
    }
    if (error.code === 'SERVICE_POLICY') {
      return res.status(400).json({ message: 'Ch\u1ec9 c\u00f3 th\u1ec3 ghi nh\u1eadn d\u1ecbch v\u1ee5 \u0111\u01b0\u1ee3c c\u1ea5u h\u00ecnh l\u00e0 \u201cGhi nh\u1eadn khi kh\u00e1ch y\u00eau c\u1ea7u\u201d.' });
    }
    if (error.code === 'BOOKING_NOT_SERVICEABLE') {
      return res.status(409).json({ message: 'ChÄ‚Â¡Ă‚Â»Ă¢â‚¬Â° cĂ„â€Ă‚Â³ thÄ‚Â¡Ă‚Â»Ă†â€™ thĂ„â€Ă‚Âªm dÄ‚Â¡Ă‚Â»Ă¢â‚¬Â¹ch vÄ‚Â¡Ă‚Â»Ă‚Â¥ cho booking Ä‚â€Ă¢â‚¬Ëœang thÄ‚Â¡Ă‚Â»Ă‚Â±c sÄ‚Â¡Ă‚Â»Ă‚Â± trong thÄ‚Â¡Ă‚Â»Ă‚Âi gian lÄ‚â€ Ă‚Â°u trĂ„â€Ă‚Âº.' });
    }
    if (error.code === 'INVALID_SERVICEABLE_SELECTION') return res.status(400).json({ message: 'MÄ‚Â¡Ă‚Â»Ă¢â€Â¢t hoÄ‚Â¡Ă‚ÂºĂ‚Â·c nhiÄ‚Â¡Ă‚Â»Ă‚Âu phĂ„â€Ă‚Â²ng hoÄ‚Â¡Ă‚ÂºĂ‚Â·c dÄ‚Â¡Ă‚Â»Ă¢â‚¬Â¹ch vÄ‚Â¡Ă‚Â»Ă‚Â¥ khĂ„â€Ă‚Â´ng hÄ‚Â¡Ă‚Â»Ă‚Â£p lÄ‚Â¡Ă‚Â»Ă¢â‚¬Â¡, Ä‚â€Ă¢â‚¬ËœĂ„â€Ă‚Â£ ngÄ‚Â¡Ă‚Â»Ă‚Â«ng hoÄ‚Â¡Ă‚ÂºĂ‚Â¡t Ä‚â€Ă¢â‚¬ËœÄ‚Â¡Ă‚Â»Ă¢â€Â¢ng hoÄ‚Â¡Ă‚ÂºĂ‚Â·c khĂ„â€Ă‚Â´ng thÄ‚Â¡Ă‚Â»Ă†â€™ dĂ„â€Ă‚Â¹ng khi lÄ‚â€ Ă‚Â°u trĂ„â€Ă‚Âº.' });
    if (error.code === 'INVOICE_ALREADY_ISSUED') return res.status(409).json({ message: 'Booking \u0111\u00e3 c\u00f3 h\u00f3a \u0111\u01a1n ph\u00e1t h\u00e0nh. Kh\u00f4ng th\u1ec3 th\u00eam d\u1ecbch v\u1ee5 sau khi h\u00f3a \u0111\u01a1n \u0111\u01b0\u1ee3c l\u1eadp.' });
    console.error('Add service to booking error:', error);
    return res.status(500).json({ message: 'Kh\u00f4ng th\u1ec3 th\u00eam d\u1ecbch v\u1ee5 v\u00e0o booking.' });
  }
}

module.exports = { getBookingServiceData, addBookingService };
