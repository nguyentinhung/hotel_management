const bookingServiceDao = require('../dao/bookingServiceDao');

module.exports = {
  getServiceableBookingRooms: (...args) => bookingServiceDao.getServiceableBookingRooms(...args),
  getBookingServices: (...args) => bookingServiceDao.getBookingServices(...args),
  addServiceToCheckedInBooking: (...args) => bookingServiceDao.addServiceToCheckedInBooking(...args),
};
