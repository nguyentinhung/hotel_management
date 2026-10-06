const crypto = require('crypto');
const {
  createFinalPayment,
  createCustomerDepositPayment,
  createReceptionCheckoutPayment,
  getPaymentList,
  getCustomerPaymentList,
  getPaymentStatus: getPaymentStatusByCode,
  confirmPaymentByCode,
  completeVnpayPayment,
  getVnpayPaymentContext,
} = require('../dao/paymentDao');
const { getVnpayConfig, buildVnpayPaymentUrl, verifyVnpayResponse } = require('./vnpayGateway');

async function makePayment({ customerId, bookingCode, paymentType, method, ipAddress }) {
  const normalizedCode = String(bookingCode || '').trim().toUpperCase();
  if (!normalizedCode || normalizedCode.length > 20) {
    const error = new Error('Vui lòng nhập mã booking hợp lệ.');
    error.statusCode = 400;
    throw error;
  }

  const normalizedMethod = String(method || '').toUpperCase();
  if (!['FINAL', 'DEPOSIT'].includes(paymentType) || (paymentType === 'DEPOSIT' ? normalizedMethod !== 'VNPAY' : !['CASH', 'VNPAY'].includes(normalizedMethod))) {
    const error = new Error('Tiền cọc chỉ hỗ trợ VNPay; thanh toán FINAL hỗ trợ tiền mặt hoặc VNPay.');
    error.statusCode = 400;
    throw error;
  }
  if (normalizedMethod === 'VNPAY') getVnpayConfig();

  const paymentCode = `PAY${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const payment = paymentType === 'DEPOSIT'
    ? await createCustomerDepositPayment({ customerId, bookingCode: normalizedCode, paymentCode })
    : await createFinalPayment({
    customerId,
    bookingCode: normalizedCode,
    paymentCode,
    method: normalizedMethod,
  });
  if (normalizedMethod !== 'VNPAY') return payment;

  return {
    ...payment,
    payment_url: buildVnpayPaymentUrl({ paymentCode, amount: payment.amount, ipAddress }),
  };
}

async function makeReceptionCheckoutPayment({ bookingId, method, ipAddress }) {
  const normalizedMethod = String(method || '').toUpperCase();
  if (!['CASH', 'VNPAY'].includes(normalizedMethod)) {
    const error = new Error('Vui lòng chọn thanh toán tiền mặt hoặc VNPay.');
    error.statusCode = 400;
    throw error;
  }
  if (normalizedMethod === 'VNPAY') getVnpayConfig();
  const paymentCode = `PAY${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const payment = await createReceptionCheckoutPayment({ bookingId, paymentCode, method: normalizedMethod });
  if (normalizedMethod !== 'VNPAY' || payment.amount <= 0) return payment;
  return { ...payment, payment_url: buildVnpayPaymentUrl({ paymentCode, amount: payment.amount, ipAddress }) };
}

async function getPayments() {
  return getPaymentList(null, true);
}

async function getCustomerPayments(customerId) {
  return getCustomerPaymentList(customerId);
}

async function getPaymentStatus(paymentCode, customerId = null) {
  return getPaymentStatusByCode({ paymentCode, customerId });
}

async function confirmPayment(paymentCode) {
  return confirmPaymentByCode(paymentCode);
}

async function handleVnpayCallback(params) {
  if (!verifyVnpayResponse(params)) {
    const error = new Error('Chữ ký phản hồi VNPay không hợp lệ.');
    error.statusCode = 400;
    throw error;
  }

  const paymentCode = String(params.vnp_TxnRef || '');
  const amountMinor = Number(params.vnp_Amount);
  if (!paymentCode || !Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    const error = new Error('Dữ liệu giao dịch VNPay không hợp lệ.');
    error.statusCode = 400;
    throw error;
  }

  const succeeded = params.vnp_ResponseCode === '00' && params.vnp_TransactionStatus === '00';
  const result = await completeVnpayPayment({
    paymentCode,
    amountMinor,
    transactionNo: params.vnp_TransactionNo,
    payDate: params.vnp_PayDate,
    succeeded,
  });
  return { ...result, paymentCode, succeeded };
}

async function inspectVnpayReturn(params) {
  if (!verifyVnpayResponse(params)) {
    const error = new Error('Chữ ký phản hồi VNPay không hợp lệ.');
    error.statusCode = 400;
    throw error;
  }
  const paymentCode = String(params.vnp_TxnRef || '');
  const amountMinor = Number(params.vnp_Amount);
  if (!paymentCode || !Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    const error = new Error('Dữ liệu giao dịch VNPay không hợp lệ.');
    error.statusCode = 400;
    throw error;
  }
  const payment = await getVnpayPaymentContext({ paymentCode, amountMinor });
  const succeeded = params.vnp_ResponseCode === '00' && params.vnp_TransactionStatus === '00';
  return { ...payment, paymentCode, succeeded };
}

module.exports = { makePayment, makeReceptionCheckoutPayment, getPayments, getCustomerPayments, getPaymentStatus, confirmPayment, handleVnpayCallback, inspectVnpayReturn };
