const { makePayment, getPayments } = require('../services/paymentService');

async function createPayment(req, res) {
  try {
    const payment = await makePayment({
      customerId: req.auth.userId,
      bookingCode: req.body?.booking_code,
      paymentType: req.body?.payment_type,
      method: req.body?.method,
    });

    return res.status(201).json({
      payment_code: payment.payment_code,
      amount: Number(payment.amount),
      status: payment.status,
    });
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
    return res.json(payments.map((payment) => ({
      payment_code: payment.payment_code,
      booking_code: payment.booking_code,
      guest_full_name: payment.guest_full_name,
      invoice_number: payment.invoice_number,
      payment_type: payment.payment_type,
      method: payment.method,
      amount: Number(payment.amount),
      status: payment.status,
      paid_at: payment.paid_at,
      vnpay_transaction_no: payment.vnpay_transaction_no,
    })));
  } catch (error) {
    console.error('Get payment list error:', error);
    return res.status(500).json({ message: 'Không thể tải danh sách thanh toán.' });
  }
}

module.exports = { createPayment, getPaymentList };
