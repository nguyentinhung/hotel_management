const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'hotel-management-secret';
const ROLE_CODE_BY_ID = { 1: 'CUSTOMER', 2: 'RECEPTIONIST', 3: 'HOUSEKEEPER', 4: 'ADMIN' };

function requireAdmin(req, res, next) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';

  if (!token) {
    return res.status(401).json({ message: 'Vui lòng đăng nhập để tiếp tục.' });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);
    const roleCode = String(user.role_code || '').toUpperCase() || ROLE_CODE_BY_ID[Number(user.role_id)];
    if (roleCode !== 'ADMIN') {
      return res.status(403).json({ message: 'Chỉ quản trị viên mới được thực hiện thao tác này.' });
    }
    return next();
  } catch {
    return res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
  }
}

function requireRoomListAccess(req, res, next) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập để tiếp tục.' });
  try {
    const user = jwt.verify(token, JWT_SECRET);
    const roleById = { 1: 'CUSTOMER', 2: 'RECEPTIONIST', 3: 'HOUSEKEEPER', 4: 'ADMIN' };
    const roleCode = String(user.role_code || roleById[Number(user.role_id)] || '').toUpperCase();
    if (!['ADMIN', 'RECEPTIONIST'].includes(roleCode)) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xem thông tin phòng.' });
    }
    return next();
  } catch {
    return res.status(401).json({ success: false, message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
  }
}




module.exports = { requireAdmin, requireRoomListAccess };
