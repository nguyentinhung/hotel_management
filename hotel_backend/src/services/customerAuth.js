const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'hotel-management-secret';

function requireRoles(allowedRoles, unauthorizedMessage) {
  return (req, res, next) => {
    const authorization = req.headers.authorization || '';
    const [scheme, token] = authorization.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ message: 'Vui lòng đăng nhập để tiếp tục.' });
    }

    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (
        !payload
        || typeof payload !== 'object'
        || !Number.isSafeInteger(Number(payload.user_id))
        || Number(payload.user_id) <= 0
      ) {
        return res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
      }

      const roleCode = String(payload.role_code || '').toUpperCase();
      if (!allowedRoles.includes(roleCode)) {
        return res.status(403).json({ message: unauthorizedMessage });
      }

      req.auth = { userId: Number(payload.user_id), roleCode };
      return next();
    } catch (error) {
      if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
        return res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
      }

      return next(error);
    }
  };
}

const requireCustomer = requireRoles(
  ['CUSTOMER'],
  'Chỉ khách hàng mới có thể tạo yêu cầu thanh toán.',
);

const requirePaymentStaff = requireRoles(
  ['RECEPTIONIST', 'ADMIN'],
  'Chỉ Lễ tân mới có thể xem danh sách thanh toán và xác nhận thanh toán.',
);

const requirePaymentActor = requireRoles(
  ['CUSTOMER', 'RECEPTIONIST', 'ADMIN'],
  'Bạn không có quyền kiểm tra trạng thái giao dịch này.',
);

module.exports = { requireCustomer, requirePaymentStaff, requirePaymentActor };
