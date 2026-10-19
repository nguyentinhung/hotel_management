const roomDao = require('../dao/roomDao');

module.exports = {
  checkRoomAvailability: (...args) => roomDao.checkRoomAvailability(...args),
  createRoom: (...args) => roomDao.createRoom(...args),
  updateRoom: (...args) => roomDao.updateRoom(...args),
  deleteRoom: (...args) => roomDao.deleteRoom(...args),
  getAvailableRoomsForType: (...args) => roomDao.getAvailableRoomsForType(...args),
  getRoomList: (...args) => roomDao.getRoomList(...args),
  getRoomDetails: (...args) => roomDao.getRoomDetails(...args),
};
