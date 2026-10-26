const BookingModel = require('../models/bookingModel');
const RoomStatusModel = require('../models/roomStatusModel');
const RoomMaintenanceReportModel = require('../models/roomMaintenanceReportModel');
const bookingDao = require('../dao/bookingDao');

async function withBookingModel(operation, ...args) {
  return BookingModel.fromResult(await operation(...args));
}

module.exports = {
  expirePendingBookings: (...args) => withBookingModel(bookingDao.expirePendingBookings, ...args),
  expireStaleBookings: (...args) => withBookingModel(bookingDao.expireStaleBookings, ...args),
  createWalkInBooking: (...args) => withBookingModel(bookingDao.createWalkInBooking, ...args),
  createCustomerBooking: (...args) => withBookingModel(bookingDao.createCustomerBooking, ...args),
  checkInBooking: (...args) => withBookingModel(bookingDao.checkInBooking, ...args),
  getRecentBookings: (...args) => withBookingModel(bookingDao.getRecentBookings, ...args),
  getBookingDetails: (...args) => withBookingModel(bookingDao.getBookingDetails, ...args),
  getActiveBookings: (...args) => withBookingModel(bookingDao.getActiveBookings, ...args),
  updateBooking: (...args) => withBookingModel(bookingDao.updateBooking, ...args),
  cancelBooking: (...args) => withBookingModel(bookingDao.cancelBooking, ...args),
  checkOutBooking: (...args) => withBookingModel(bookingDao.checkOutBooking, ...args),
  reportRoomMaintenance: (...args) => withBookingModel(bookingDao.reportRoomMaintenance, ...args),
  getOpenRoomMaintenanceReports: async (...args) => RoomMaintenanceReportModel.fromResult(await bookingDao.getOpenRoomMaintenanceReports(...args)),
  resolveRoomMaintenanceReport: (...args) => withBookingModel(bookingDao.resolveRoomMaintenanceReport, ...args),
  getRoomStatuses: async (...args) => RoomStatusModel.fromResult(await bookingDao.getRoomStatuses(...args)),
  getAssignableRooms: (...args) => withBookingModel(bookingDao.getAssignableRooms, ...args),
  assignRoomToBooking: (...args) => withBookingModel(bookingDao.assignRoomToBooking, ...args),
};
