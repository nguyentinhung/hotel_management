const {
  createFinalPayment,
  createCustomerDepositPayment,
  completeSimulatedDepositPayment,
  createReceptionCheckoutPayment,
  createReceptionInvoice: createReceptionInvoiceDao,
  syncReceptionBookingCompensations: syncReceptionBookingCompensationsDao,
  getPaymentList,
  getCustomerPaymentList,
  getPaymentStatus: getPaymentStatusByCode,
  getPaymentDetails: getPaymentDetailsDao,
  confirmPaymentByCode,
  completeVnpayPayment,
  getVnpayPaymentContext,
} = require('../dao/paymentDao');
const { getVnpayConfig, buildVnpayPaymentUrl, verifyVnpayResponse } = require('./vnpayGateway');
const { getInvoiceDetails: getInvoiceDetailsDao } = require('./invoiceService');

const crypto = require('node:crypto');
const { toInvoiceDetailsResponse } = require('../dto/invoice/view-invoice-details/invoice-details-response.dto');
const vnpayEnabled = String(process.env.VNPAY_ENABLED || '').toLowerCase() === 'true';

function normalizePaymentMethod(method) {
  return String(method || '').toUpperCase();
}

function generatePaymentCode() {
  return `PAY${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

async function makePayment({ customerId, bookingCode, paymentType, method, ipAddress }) {
  const normalizedCode = String(bookingCode || '').trim().toUpperCase();
  if (!normalizedCode || normalizedCode.length > 20) {
    const error = new Error('Vui lòng nhập mã booking hợp lệ.');
    error.statusCode = 400;
    throw error;
  }

  const normalizedMethod = normalizePaymentMethod(method);
  const supportedMethods = paymentType === 'DEPOSIT'
    ? (vnpayEnabled ? ['VNPAY'] : ['SIMULATED'])
    : (vnpayEnabled ? ['CASH', 'VNPAY'] : ['CASH']);
  if (!['FINAL', 'DEPOSIT'].includes(paymentType) || !supportedMethods.includes(normalizedMethod)) {
    const error = new Error(vnpayEnabled
      ? 'Vui lòng chọn phương thức thanh toán hợp lệ.'
      : paymentType === 'DEPOSIT'
        ? 'Tiền cọc hiện chỉ hỗ trợ mô phỏng thanh toán.'
        : 'Hiện chỉ hỗ trợ thanh toán tiền mặt tại quầy.');
    error.statusCode = 400;
    throw error;
  }
  if (normalizedMethod === 'VNPAY') getVnpayConfig();

  const paymentCode = generatePaymentCode();
  const payment = paymentType === 'DEPOSIT'
    ? await createCustomerDepositPayment({
      customerId,
      bookingCode: normalizedCode,
      paymentCode,
      method: normalizedMethod === 'SIMULATED' ? 'VNPAY' : normalizedMethod,
      simulated: normalizedMethod === 'SIMULATED',
    })
    : await createFinalPayment({
    customerId,
    bookingCode: normalizedCode,
    paymentCode,
    method: normalizedMethod,
  });
  const paymentRecord = payment;
  return normalizedMethod === 'VNPAY'
    ? { ...paymentRecord, payment_url: buildVnpayPaymentUrl({ paymentCode, amount: payment.amount, ipAddress }) }
    : paymentRecord;
}

async function simulateDepositPayment({ paymentCode, customerId, succeeded }) {
  if (vnpayEnabled) {
    const error = new Error('Mô phỏng thanh toán đang tắt khi VNPay được bật.');
    error.statusCode = 409;
    throw error;
  }
  return await completeSimulatedDepositPayment({ paymentCode, customerId, succeeded });
}

async function makeReceptionCheckoutPayment({ bookingId, method, ipAddress, createdByUserId }) {
  const normalizedMethod = normalizePaymentMethod(method);
  if (normalizedMethod !== 'CASH' && !(vnpayEnabled && normalizedMethod === 'VNPAY')) {
    const error = new Error(vnpayEnabled ? 'Vui lòng chọn phương thức thanh toán hợp lệ.' : 'VNPay đang tạm dừng; hiện chỉ hỗ trợ thanh toán tiền mặt tại quầy.');
    error.statusCode = 400;
    throw error;
  }
  if (normalizedMethod === 'VNPAY') getVnpayConfig();
  const paymentCode = generatePaymentCode();
  const payment = await createReceptionCheckoutPayment({ bookingId, paymentCode, method: normalizedMethod, createdByUserId });
  const paymentRecord = payment;
  return normalizedMethod === 'VNPAY' && payment.amount > 0
    ? { ...paymentRecord, payment_url: buildVnpayPaymentUrl({ paymentCode: payment.payment_code, amount: payment.amount, ipAddress }) }
    : paymentRecord;
}

async function createReceptionInvoice(bookingId, createdByUserId) {
  return await createReceptionInvoiceDao(bookingId, createdByUserId);
}

async function syncReceptionBookingCompensations(bookingId) {
  const result = await syncReceptionBookingCompensationsDao(bookingId);
  const invoice = await getInvoiceDetailsDao(result.invoice.invoice_id || result.invoice.id);
  return {
    invoice: invoice ? toInvoiceDetailsResponse(invoice) : result.invoice,
    compensation_items: result.compensation_items,
  };
}

async function getPayments() {
  return await getPaymentList(null, true);
}

async function getCustomerPayments(customerId) {
  return await getCustomerPaymentList(customerId);
}

async function getPaymentStatus(paymentCode, customerId = null) {
  return await getPaymentStatusByCode({ paymentCode, customerId });
}

async function getPaymentDetails(paymentCode, customerId = null) {
  return await getPaymentDetailsDao({ paymentCode, customerId });
}

async function confirmPayment(paymentCode) {
  return await confirmPaymentByCode(paymentCode);
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

module.exports = { makePayment, simulateDepositPayment, makeReceptionCheckoutPayment, createReceptionInvoice, syncReceptionBookingCompensations, getPayments, getCustomerPayments, getPaymentStatus, getPaymentDetails, confirmPayment, handleVnpayCallback, inspectVnpayReturn };
