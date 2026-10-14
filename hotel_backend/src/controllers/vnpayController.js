const { handleVnpayCallback } = require('../services/paymentService');

function getFrontendResultUrl(result, paymentCode, paymentType, bookingCode) {
  const baseUrl = String(process.env.APP_BASE_URL || 'http://localhost:4173').replace(/\/$/, '');
  const url = new URL('/make-payment', baseUrl);
  url.searchParams.set('paymentResult', result);
  if (paymentCode) url.searchParams.set('paymentCode', paymentCode);
  if (paymentType) url.searchParams.set('paymentType', String(paymentType).toUpperCase());
  if (bookingCode) url.searchParams.set('bookingCode', bookingCode);
  return url.toString();
}

async function handleVnpayReturn(req, res) {
  try {
    // VNPay's signed browser return can arrive before the server-to-server IPN.
    // Apply the same idempotent verified update here so a canceled attempt is
    // released immediately and a successful deposit can be shown as confirmed.
    const result = await handleVnpayCallback(req.query);
    return res.redirect(303, getFrontendResultUrl(result.succeeded ? 'success' : 'failed', result.paymentCode, result.paymentType, result.bookingCode));
  } catch (error) {
    console.error('VNPay return validation failed:', error.message);
    return res.redirect(303, getFrontendResultUrl('invalid'));
  }
}

async function handleVnpayIpn(req, res) {
  try {
    const result = await handleVnpayCallback(req.query);
    if (result.alreadyCompleted) {
      return res.status(200).json({ RspCode: '02', Message: 'Order already confirmed' });
    }
    return res.status(200).json({ RspCode: '00', Message: 'Confirm Success' });
  } catch (error) {
    const responseCode = error.code === 'PAYMENT_NOT_FOUND' ? '01'
      : error.code === 'PAYMENT_AMOUNT_MISMATCH' ? '04'
        : error.code === 'PAYMENT_NOT_PENDING' ? '02'
          : error.statusCode === 400 ? '97' : '99';
    return res.status(200).json({ RspCode: responseCode, Message: error.message || 'Unknown error' });
  }
}

module.exports = { handleVnpayReturn, handleVnpayIpn };
