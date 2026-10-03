const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'hotel-management-secret';

function requireCustomer(req, res, next) {
  const authorization = req.headers.authorization || '';
  const [scheme, token] = authorization.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Vui lòng đăng nhập để thanh toán.' });
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

    if (String(payload.role_code || '').toUpperCase() !== 'CUSTOMER') {
      return res.status(403).json({ message: 'Chỉ khách hàng mới có thể tạo yêu cầu thanh toán.' });
    }

    req.auth = { userId: Number(payload.user_id) };
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
    }

    return next(error);
  }
}

module.exports = { requireCustomer };
