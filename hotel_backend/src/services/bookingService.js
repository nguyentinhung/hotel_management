const BookingModel = require('../models/bookingModel');
const bookingDao = require('../dao/bookingDao');

module.exports = {
  expirePendingBookings: (...args) => bookingDao.expirePendingBookings(...args),
  expireStaleBookings: (...args) => bookingDao.expireStaleBookings(...args),
  createWalkInBooking: async (...args) => BookingModel.fromRow(await bookingDao.createWalkInBooking(...args)),
  createCustomerBooking: async (...args) => BookingModel.fromRow(await bookingDao.createCustomerBooking(...args)),
  checkInBooking: (...args) => bookingDao.checkInBooking(...args),
  getRecentBookings: (...args) => bookingDao.getRecentBookings(...args),
  getActiveBookings: (...args) => bookingDao.getActiveBookings(...args),
  updateBooking: async (...args) => BookingModel.fromRow(await bookingDao.updateBooking(...args)),
  cancelBooking: (...args) => bookingDao.cancelBooking(...args),
  checkOutBooking: (...args) => bookingDao.checkOutBooking(...args),
  updateRoomStatus: (...args) => bookingDao.updateRoomStatus(...args),
  reportRoomMaintenance: (...args) => bookingDao.reportRoomMaintenance(...args),
  getOpenRoomMaintenanceReports: (...args) => bookingDao.getOpenRoomMaintenanceReports(...args),
  resolveRoomMaintenanceReport: (...args) => bookingDao.resolveRoomMaintenanceReport(...args),
  getRoomStatuses: (...args) => bookingDao.getRoomStatuses(...args),
  getAssignableRooms: (...args) => bookingDao.getAssignableRooms(...args),
  assignRoomToBooking: (...args) => bookingDao.assignRoomToBooking(...args),
};
