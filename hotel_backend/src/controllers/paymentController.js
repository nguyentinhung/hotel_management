const { makePayment, simulateDepositPayment, getPayments, getCustomerPayments, getPaymentStatus, getPaymentDetails, confirmPayment } = require('../services/paymentService');
const { toMakePaymentRequest } = require('../dto/payment/make-payment/make-payment-request.dto');
const { toMakePaymentResponse } = require('../dto/payment/make-payment/make-payment-response.dto');
const { toPaymentStatusResponse } = require('../dto/payment/view-payment-status/payment-status-response.dto');
const { toPaymentDetailsResponse } = require('../dto/payment/view-payment-details/payment-details-response.dto');
const { toConfirmPaymentResponse } = require('../dto/payment/confirm-payment/confirm-payment-response.dto');
const { toSimulatePaymentRequest } = require('../dto/payment/simulate-payment/simulate-payment-request.dto');
const { toSimulatePaymentResponse } = require('../dto/payment/simulate-payment/simulate-payment-response.dto');
const { toPaymentListReceptionResponse } = require('../dto/payment/view-payment-list-reception/payment-list-reception-response.dto');
const { toPaymentListCustomerResponse } = require('../dto/payment/view-payment-list-customer/payment-list-customer-response.dto');

async function createPayment(req, res) {
  try {
    const { booking_code: bookingCode, payment_type: paymentType, method } = toMakePaymentRequest(req.body);
    const payment = await makePayment({
      customerId: req.auth.userId,
      bookingCode,
      paymentType,
      method,
      ipAddress: req.ip,
    });

    return res.status(201).json(toMakePaymentResponse(payment));
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    console.error('Create payment error:', error);
    return res.status(500).json({ message: 'Không thể tạo yêu cầu thanh toán.' });
  }
}

async function getPaymentList(_req, res) {
  try {
    const payments = await getPayments();
    return res.json(toPaymentListReceptionResponse(payments));
  } catch (error) {
    console.error('Get payment list error:', error);
    return res.status(500).json({ message: 'Không thể tải danh sách thanh toán.' });
  }
}

async function getCustomerPaymentList(req, res) {
  try {
    const payments = await getCustomerPayments(req.auth.userId);
    return res.json(toPaymentListCustomerResponse(payments));
  } catch (error) {
    console.error('Get customer payment list error:', error);
    return res.status(500).json({ message: 'Không thể tải lịch sử thanh toán của bạn.' });
  }
}

async function getPaymentStatusRequest(req, res) {
  try {
    const paymentCode = String(req.params?.paymentCode || '').trim();
    if (!paymentCode) return res.status(400).json({ message: 'Thiếu mã giao dịch.' });
    const customerId = req.auth.roleCode === 'CUSTOMER' ? req.auth.userId : null;
    const payment = await getPaymentStatus(paymentCode, customerId);
    if (!payment) return res.status(404).json({ message: 'Không tìm thấy giao dịch.' });
    return res.json(toPaymentStatusResponse(payment));
  } catch (error) {
    console.error('Get payment status error:', error);
    return res.status(500).json({ message: 'Không thể kiểm tra trạng thái giao dịch.' });
  }
}

async function getPaymentDetailsRequest(req, res) {
  try {
    const paymentCode = String(req.params?.paymentCode || '').trim();
    if (!paymentCode || paymentCode.length > 30) {
      return res.status(400).json({ message: 'MÃ£ giao dá»‹ch khÃ´ng há»£p lá»‡.' });
    }
    const customerId = req.auth.roleCode === 'CUSTOMER' ? req.auth.userId : null;
    const payment = await getPaymentDetails(paymentCode, customerId);
    if (!payment) return res.status(404).json({ message: 'KhÃ´ng tÃ¬m tháº¥y giao dá»‹ch.' });
    return res.json(toPaymentDetailsResponse(payment));
  } catch (error) {
    console.error('Get payment details error:', error);
    return res.status(500).json({ message: 'KhÃ´ng thá»ƒ táº£i chi tiáº¿t giao dá»‹ch.' });
  }
}

async function confirmPaymentRequest(req, res) {
  try {
    const paymentCode = String(req.params?.paymentCode || '').trim();
    if (!paymentCode) {
      return res.status(400).json({ message: 'Thiếu mã thanh toán cần xác nhận.' });
    }

    const result = await confirmPayment(paymentCode);
    return res.json(toConfirmPaymentResponse(result));
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    console.error('Confirm payment error:', error);
    return res.status(500).json({ message: 'Không thể xác nhận thanh toán.' });
  }
}

async function simulateDepositPaymentRequest(req, res) {
  const paymentCode = String(req.params?.paymentCode || '').trim();
  const { succeeded } = toSimulatePaymentRequest(req.body);
  if (!paymentCode) return res.status(400).json({ message: 'Thiếu mã thanh toán cần mô phỏng.' });
  if (typeof succeeded !== 'boolean') return res.status(400).json({ message: 'Kết quả mô phỏng phải là thành công hoặc thất bại.' });

  try {
    const result = await simulateDepositPayment({ paymentCode, customerId: req.auth.userId, succeeded });
    return res.json(toSimulatePaymentResponse(succeeded, result));
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error('Simulate deposit payment error:', error);
    return res.status(500).json({ message: 'Không thể mô phỏng thanh toán cọc.' });
  }
}

module.exports = { createPayment, getPaymentList, getCustomerPaymentList, getPaymentStatusRequest, getPaymentDetailsRequest, confirmPaymentRequest, simulateDepositPaymentRequest };
