const crypto = require('crypto');

const VNPAY_SANDBOX_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';

function getVnpayConfig() {
  const tmnCode = String(process.env.VNPAY_TMN_CODE || '').trim();
  const hashSecret = String(process.env.VNPAY_HASH_SECRET || '').trim();
  if (!tmnCode || !hashSecret) {
    const error = new Error('VNPay chưa được cấu hình. Hãy đặt VNPAY_TMN_CODE và VNPAY_HASH_SECRET trong hotel_backend/.env.');
    error.statusCode = 503;
    throw error;
  }
  if (!/^[a-z\d]{8}$/i.test(tmnCode)) {
    const error = new Error('VNPAY_TMN_CODE phải có đúng 8 ký tự chữ hoặc số.');
    error.statusCode = 503;
    throw error;
  }

  const paymentUrl = process.env.VNPAY_PAYMENT_URL || VNPAY_SANDBOX_URL;
  let parsedPaymentUrl;
  try { parsedPaymentUrl = new URL(paymentUrl); } catch {
    const error = new Error('VNPAY_PAYMENT_URL không hợp lệ.');
    error.statusCode = 500;
    throw error;
  }
  if (parsedPaymentUrl.protocol !== 'https:') {
    const error = new Error('VNPay yêu cầu VNPAY_PAYMENT_URL sử dụng HTTPS.');
    error.statusCode = 500;
    throw error;
  }

  const apiBaseUrl = String(process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/$/, '');
  const returnUrl = process.env.VNPAY_RETURN_URL || `${apiBaseUrl}/api/payments/vnpay/return`;
  return { tmnCode, hashSecret, paymentUrl, returnUrl };
}

function formatVnpayDate(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}${values.month}${values.day}${values.hour}${values.minute}${values.second}`;
}

function formEncode(value) {
  return encodeURIComponent(String(value))
    .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, '+');
}

function canonicalVnpayData(params) {
  return Object.keys(params)
    .filter((key) => key.startsWith('vnp_') && key !== 'vnp_SecureHash' && key !== 'vnp_SecureHashType')
    .sort()
    .map((key) => `${formEncode(key)}=${formEncode(params[key])}`)
    .join('&');
}

function signVnpayData(data, secret) {
  return crypto.createHmac('sha512', secret).update(data, 'utf8').digest('hex');
}

function buildVnpayPaymentUrl({ paymentCode, amount, ipAddress }) {
  const { tmnCode, hashSecret, paymentUrl, returnUrl } = getVnpayConfig();
  const now = new Date();
  const expire = new Date(now.getTime() + 15 * 60 * 1000);
  const params = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: tmnCode,
    vnp_Amount: String(Math.round(Number(amount) * 100)),
    vnp_CurrCode: 'VND',
    vnp_TxnRef: paymentCode,
    vnp_OrderInfo: `Thanh toan booking ${paymentCode}`,
    vnp_OrderType: 'other',
    vnp_Locale: 'vn',
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: normalizeIpAddress(ipAddress),
    vnp_CreateDate: formatVnpayDate(now),
    vnp_ExpireDate: formatVnpayDate(expire),
  };

  const query = canonicalVnpayData(params);
  const signature = signVnpayData(query, hashSecret);
  return `${paymentUrl}?${query}&vnp_SecureHash=${signature}`;
}

function normalizeIpAddress(value) {
  const ipAddress = String(value || '').replace(/^::ffff:/, '');
  return ipAddress.length >= 7 && ipAddress.length <= 45 ? ipAddress : '127.0.0.1';
}

function verifyVnpayResponse(params) {
  const secureHash = String(params.vnp_SecureHash || '');
  if (!/^[a-f\d]{128}$/i.test(secureHash)) return false;
  let config;
  try { config = getVnpayConfig(); } catch { return false; }
  if (String(params.vnp_TmnCode || '') !== config.tmnCode) return false;

  const expectedHash = signVnpayData(canonicalVnpayData(params), config.hashSecret);
  const supplied = Buffer.from(secureHash, 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

module.exports = { getVnpayConfig, buildVnpayPaymentUrl, verifyVnpayResponse };
