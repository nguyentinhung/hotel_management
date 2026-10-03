const crypto = require('crypto');
const { createFinalCashPayment } = require('../dao/paymentDao');

async function makePayment({ customerId, bookingCode, paymentType, method }) {
  const normalizedCode = String(bookingCode || '').trim().toUpperCase();
  if (!normalizedCode || normalizedCode.length > 20) {
    const error = new Error('Vui lòng nhập mã booking hợp lệ.');
    error.statusCode = 400;
    throw error;
  }

  if (paymentType !== 'FINAL' || method !== 'CASH') {
    const error = new Error('Hiện chỉ hỗ trợ yêu cầu thanh toán hóa đơn FINAL bằng tiền mặt tại quầy.');
    error.statusCode = 400;
    throw error;
  }

  const paymentCode = `PAY-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  return createFinalCashPayment({ customerId, bookingCode: normalizedCode, paymentCode });
}

module.exports = { makePayment };
