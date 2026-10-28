const bookingServiceManagement = require('../services/bookingServiceManagement');

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
    const service = await bookingServiceManagement.addServiceToCheckedInBooking({
      bookingId: req.params.bookingId,
      bookingRoomId: req.body?.booking_room_id,
      serviceId: req.body?.service_id,
      quantity: req.body?.quantity,
      customerId: req.bookingServiceCustomerId,
    });
    return res.status(201).json({ success: true, service });
  } catch (error) {
    if (error.code === 'INVALID_BOOKING_ID') return res.status(400).json({ message: 'M\u00e3 booking kh\u00f4ng h\u1ee3p l\u1ec7.' });
    if (error.code === 'INVALID_SELECTION') {
      return res.status(400).json({ message: 'Vui l\u00f2ng ch\u1ecdn ph\u00f2ng, d\u1ecbch v\u1ee5 v\u00e0 s\u1ed1 l\u01b0\u1ee3ng h\u1ee3p l\u1ec7 (1\u2013100).' });
    }
    if (error.code === 'SERVICE_POLICY') {
      return res.status(400).json({ message: 'Ch\u1ec9 c\u00f3 th\u1ec3 ghi nh\u1eadn d\u1ecbch v\u1ee5 \u0111\u01b0\u1ee3c c\u1ea5u h\u00ecnh l\u00e0 \u201cGhi nh\u1eadn khi kh\u00e1ch y\u00eau c\u1ea7u\u201d.' });
    }
    if (error.code === 'BOOKING_NOT_SERVICEABLE') {
      return res.status(409).json({ message: 'Ch\u1ec9 c\u00f3 th\u1ec3 th\u00eam d\u1ecbch v\u1ee5 v\u00e0o booking c\u1ee7a b\u1ea1n \u0111ang trong th\u1eddi gian l\u01b0u tr\u00fa v\u00e0 d\u1ecbch v\u1ee5 c\u00f2n ho\u1ea1t \u0111\u1ed9ng.' });
    }
    console.error('Add service to booking error:', error);
    return res.status(500).json({ message: 'Kh\u00f4ng th\u1ec3 th\u00eam d\u1ecbch v\u1ee5 v\u00e0o booking.' });
  }
}

module.exports = { getBookingServiceData, addBookingService };
