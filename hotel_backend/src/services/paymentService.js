const {
  createFinalPayment,
  createCustomerDepositPayment,
  completeSimulatedDepositPayment,
  createReceptionCheckoutPayment,
  createReceptionInvoice: createReceptionInvoiceDao,
  getPaymentList,
  getCustomerPaymentList,
  getInvoiceList: getInvoiceListDao,
  getInvoiceDetails: getInvoiceDetailsDao,
  getPaymentStatus: getPaymentStatusByCode,
  confirmPaymentByCode,
  completeVnpayPayment,
  getVnpayPaymentContext,
} = require('../dao/paymentDao');
const { getVnpayConfig, buildVnpayPaymentUrl, verifyVnpayResponse } = require('./vnpayGateway');

const PaymentModel = require('../models/paymentModel');
const InvoiceModel = require('../models/invoiceModel');
const vnpayEnabled = String(process.env.VNPAY_ENABLED || '').toLowerCase() === 'true';

async function makePayment({ customerId, bookingCode, paymentType, method, ipAddress }) {
  const normalizedCode = String(bookingCode || '').trim().toUpperCase();
  if (!normalizedCode || normalizedCode.length > 20) {
    const error = new Error('Vui lòng nhập mã booking hợp lệ.');
    error.statusCode = 400;
    throw error;
  }

  const normalizedMethod = PaymentModel.normalizeMethod(method);
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

  const paymentCode = PaymentModel.generateCode();
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
  return normalizedMethod === 'VNPAY'
    ? { ...payment, payment_url: buildVnpayPaymentUrl({ paymentCode, amount: payment.amount, ipAddress }) }
    : payment;
}

async function simulateDepositPayment({ paymentCode, customerId, succeeded }) {
  if (vnpayEnabled) {
    const error = new Error('Mô phỏng thanh toán đang tắt khi VNPay được bật.');
    error.statusCode = 409;
    throw error;
  }
  return completeSimulatedDepositPayment({ paymentCode, customerId, succeeded });
}

async function makeReceptionCheckoutPayment({ bookingId, method, ipAddress, createdByUserId }) {
  const normalizedMethod = PaymentModel.normalizeMethod(method);
  if (normalizedMethod !== 'CASH' && !(vnpayEnabled && normalizedMethod === 'VNPAY')) {
    const error = new Error(vnpayEnabled ? 'Vui lòng chọn phương thức thanh toán hợp lệ.' : 'VNPay đang tạm dừng; hiện chỉ hỗ trợ thanh toán tiền mặt tại quầy.');
    error.statusCode = 400;
    throw error;
  }
  if (normalizedMethod === 'VNPAY') getVnpayConfig();
  const paymentCode = PaymentModel.generateCode();
  const payment = await createReceptionCheckoutPayment({ bookingId, paymentCode, method: normalizedMethod, createdByUserId });
  return normalizedMethod === 'VNPAY' && payment.amount > 0
    ? { ...payment, payment_url: buildVnpayPaymentUrl({ paymentCode, amount: payment.amount, ipAddress }) }
    : payment;
}

async function createReceptionInvoice(bookingId, createdByUserId) {
  return createReceptionInvoiceDao(bookingId, createdByUserId);
}

async function getPayments() {
  return getPaymentList(null, true);
}

async function getCustomerPayments(customerId) {
  return getCustomerPaymentList(customerId);
}

async function getInvoices(customerId = null) {
  const rows = await getInvoiceListDao(customerId);
  return rows.map((invoice) => InvoiceModel.normalizeListItem(invoice));
}

async function getInvoiceDetails(invoiceId, customerId = null) {
  const invoice = await getInvoiceDetailsDao(invoiceId, customerId);
  return invoice ? InvoiceModel.normalizeDetails(invoice) : null;
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

module.exports = { makePayment, simulateDepositPayment, makeReceptionCheckoutPayment, createReceptionInvoice, getPayments, getCustomerPayments, getInvoices, getInvoiceDetails, getPaymentStatus, confirmPayment, handleVnpayCallback, inspectVnpayReturn };
