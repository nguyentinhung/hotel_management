const { makePayment } = require('../services/paymentService');

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

module.exports = { createPayment };
