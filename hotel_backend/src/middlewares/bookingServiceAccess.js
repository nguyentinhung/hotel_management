const jwt = require('jsonwebtoken');
const { jwtSecret: JWT_SECRET } = require('../config/auth');
const roleCodeById = { 1: 'CUSTOMER', 2: 'RECEPTIONIST', 3: 'HOUSEKEEPER', 4: 'ADMIN' };
const getRoleCode = (claims) => String(claims.role_code || '').toUpperCase() || roleCodeById[Number(claims.role_id)];

function requireBookingServiceReadAccess(req, res, next) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return res.status(401).json({ message: 'Vui lòng đăng nhập để tiếp tục.' });
  try {
    const claims = jwt.verify(token, JWT_SECRET);
    const roleCode = getRoleCode(claims);
    if (['RECEPTIONIST', 'ADMIN'].includes(roleCode)) {
      req.bookingServiceCustomerId = null;
      return next();
    }
    if (roleCode === 'CUSTOMER' && claims.user_id) {
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
    const roleCode = getRoleCode(claims);
    if (['RECEPTIONIST', 'ADMIN'].includes(roleCode)) {
      req.bookingServiceCustomerId = null;
      return next();
    }
    if (roleCode === 'CUSTOMER' && claims.user_id) {
      req.bookingServiceCustomerId = claims.user_id;
      return next();
    }
    return res.status(403).json({ message: 'Bạn không có quyền thêm dịch vụ vào booking.' });
  } catch {
    return res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
  }
}

module.exports = { requireBookingServiceReadAccess, requireBookingServiceWriteAccess };
