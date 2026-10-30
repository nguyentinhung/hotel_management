const {
  createFinalPayment,
  createCustomerDepositPayment,
  completeSimulatedDepositPayment,
  createReceptionCheckoutPayment,
  createReceptionInvoice: createReceptionInvoiceDao,
  syncReceptionBookingCompensations: syncReceptionBookingCompensationsDao,
  getPaymentList,
  getCustomerPaymentList,
  getInvoiceList: getInvoiceListDao,
  getInvoiceDetails: getInvoiceDetailsDao,
  getPaymentStatus: getPaymentStatusByCode,
  getPaymentDetails: getPaymentDetailsDao,
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
  const paymentModel = PaymentModel.fromResult(payment);
  return normalizedMethod === 'VNPAY'
    ? { ...paymentModel, payment_url: buildVnpayPaymentUrl({ paymentCode, amount: payment.amount, ipAddress }) }
    : paymentModel;
}

async function simulateDepositPayment({ paymentCode, customerId, succeeded }) {
  if (vnpayEnabled) {
    const error = new Error('Mô phỏng thanh toán đang tắt khi VNPay được bật.');
    error.statusCode = 409;
    throw error;
  }
  return PaymentModel.fromResult(await completeSimulatedDepositPayment({ paymentCode, customerId, succeeded }));
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
  const paymentModel = PaymentModel.fromResult(payment);
  return normalizedMethod === 'VNPAY' && payment.amount > 0
    ? { ...paymentModel, payment_url: buildVnpayPaymentUrl({ paymentCode: payment.payment_code, amount: payment.amount, ipAddress }) }
    : paymentModel;
}

async function createReceptionInvoice(bookingId, createdByUserId) {
  return InvoiceModel.fromResult(await createReceptionInvoiceDao(bookingId, createdByUserId));
}

async function syncReceptionBookingCompensations(bookingId) {
  const result = await syncReceptionBookingCompensationsDao(bookingId);
  const invoice = await getInvoiceDetailsDao(result.invoice.invoice_id || result.invoice.id);
  return {
    invoice: invoice ? InvoiceModel.fromResult(InvoiceModel.normalizeDetails(invoice)) : result.invoice,
    compensation_items: result.compensation_items,
  };
}

async function getPayments() {
  return PaymentModel.fromResult(await getPaymentList(null, true));
}

async function getCustomerPayments(customerId) {
  return PaymentModel.fromResult(await getCustomerPaymentList(customerId));
}

async function getInvoices(customerId = null) {
  const rows = await getInvoiceListDao(customerId);
  return rows.map((invoice) => InvoiceModel.fromResult(InvoiceModel.normalizeListItem(invoice)));
}

async function getInvoiceDetails(invoiceId, customerId = null) {
  const invoice = await getInvoiceDetailsDao(invoiceId, customerId);
  return invoice ? InvoiceModel.fromResult(InvoiceModel.normalizeDetails(invoice)) : null;
}

async function getPaymentStatus(paymentCode, customerId = null) {
  return PaymentModel.fromResult(await getPaymentStatusByCode({ paymentCode, customerId }));
}

async function getPaymentDetails(paymentCode, customerId = null) {
  return PaymentModel.fromResult(await getPaymentDetailsDao({ paymentCode, customerId }));
}

async function confirmPayment(paymentCode) {
  return PaymentModel.fromResult(await confirmPaymentByCode(paymentCode));
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
  return PaymentModel.fromResult({ ...result, paymentCode, succeeded });
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
  return PaymentModel.fromResult({ ...payment, paymentCode, succeeded });
}

module.exports = { makePayment, simulateDepositPayment, makeReceptionCheckoutPayment, createReceptionInvoice, syncReceptionBookingCompensations, getPayments, getCustomerPayments, getInvoices, getInvoiceDetails, getPaymentStatus, getPaymentDetails, confirmPayment, handleVnpayCallback, inspectVnpayReturn };
