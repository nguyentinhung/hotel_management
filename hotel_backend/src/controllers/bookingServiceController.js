const jwt = require('jsonwebtoken');
const { getServiceableBookingRooms, getBookingServices, addServiceToCheckedInBooking } = require('../dao/bookingServiceDao');
const JWT_SECRET = process.env.JWT_SECRET || 'hotel-management-secret';

function requireReceptionOrAdmin(req, res, next) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return res.status(401).json({ message: 'Vui lòng đăng nhập để tiếp tục.' });
  try {
    const claims = jwt.verify(token, JWT_SECRET);
    if (![2, 4].includes(Number(claims.role_id)) && !['RECEPTIONIST', 'ADMIN'].includes(String(claims.role_code || '').toUpperCase())) {
      return res.status(403).json({ message: 'Chỉ lễ tân hoặc quản trị viên được thao tác dịch vụ của booking.' });
    }
    req.staffClaims = claims;
    return next();
  } catch {
    return res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
  }
}

function requireBookingServiceReadAccess(req, res, next) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return res.status(401).json({ message: 'Vui lòng đăng nhập để tiếp tục.' });
  try {
    const claims = jwt.verify(token, JWT_SECRET);
    const roleCode = String(claims.role_code || '').toUpperCase();
    if ([2, 4].includes(Number(claims.role_id)) || ['RECEPTIONIST', 'ADMIN'].includes(roleCode)) {
      req.bookingServiceCustomerId = null;
      return next();
    }
    if ((Number(claims.role_id) === 1 || roleCode === 'CUSTOMER') && claims.user_id) {
      req.bookingServiceCustomerId = claims.user_id;
      return next();
    }
    return res.status(403).json({ message: 'Bạn không có quyền xem dịch vụ của booking.' });
  } catch {
    return res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
  }
}

function requireBookingServiceWriteAccess(req, res, next) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return res.status(401).json({ message: 'Vui lòng đăng nhập để tiếp tục.' });
  try {
    const claims = jwt.verify(token, JWT_SECRET);
    const roleCode = String(claims.role_code || '').toUpperCase();
    if ([2, 4].includes(Number(claims.role_id)) || ['RECEPTIONIST', 'ADMIN'].includes(roleCode)) {
      req.bookingServiceCustomerId = null;
      return next();
    }
    if ((Number(claims.role_id) === 1 || roleCode === 'CUSTOMER') && claims.user_id) {
      req.bookingServiceCustomerId = claims.user_id;
      return next();
    }
    return res.status(403).json({ message: 'Bạn không có quyền thêm dịch vụ vào booking.' });
  } catch {
    return res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
  }
}

function validBookingId(value) {
  return /^\d+$/.test(String(value)) && BigInt(value) > 0n;
}

async function getBookingServiceData(req, res) {
  if (!validBookingId(req.params.bookingId)) return res.status(400).json({ message: 'Mã booking không hợp lệ.' });
  try {
    const [rooms, services] = await Promise.all([
      getServiceableBookingRooms(req.params.bookingId, req.bookingServiceCustomerId),
      getBookingServices(req.params.bookingId, req.bookingServiceCustomerId),
    ]);
    return res.json({ rooms, services });
  } catch (error) {
    console.error('Get booking services error:', error);
    return res.status(500).json({ message: 'Không thể tải dịch vụ trong booking.' });
  }
}

async function addBookingService(req, res) {
  if (!validBookingId(req.params.bookingId)) return res.status(400).json({ message: 'Mã booking không hợp lệ.' });
  const bookingRoomId = Number(req.body?.booking_room_id);
  const serviceId = Number(req.body?.service_id);
  const quantity = Number(req.body?.quantity);
  if (!Number.isSafeInteger(bookingRoomId) || bookingRoomId < 1 || !Number.isInteger(serviceId) || serviceId < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    return res.status(400).json({ message: 'Vui lòng chọn phòng, dịch vụ và số lượng hợp lệ (1–100).' });
  }
  try {
    const service = await addServiceToCheckedInBooking({ bookingId: req.params.bookingId, bookingRoomId, serviceId, quantity, customerId: req.bookingServiceCustomerId });
    return res.status(201).json({ success: true, service });
  } catch (error) {
    if (/not found, or booking is not checked in/i.test(error.message)) {
      return res.status(409).json({ message: 'Chỉ có thể thêm dịch vụ vào booking của bạn đang trong thời gian lưu trú và dịch vụ còn hoạt động.' });
    }
    console.error('Add service to booking error:', error);
    return res.status(500).json({ message: 'Không thể thêm dịch vụ vào booking.' });
  }
}

module.exports = { requireReceptionOrAdmin, requireBookingServiceReadAccess, requireBookingServiceWriteAccess, getBookingServiceData, addBookingService };
