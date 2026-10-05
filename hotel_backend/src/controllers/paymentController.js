const { makePayment, getPayments, getCustomerPayments, confirmPayment } = require('../services/paymentService');

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

function serializePayments(payments) {
  const parseJsonArray = (value) => {
    if (!value) return [];
    return Array.isArray(value) ? value : JSON.parse(value);
  };

  return payments.map((payment) => ({
    payment_code: payment.payment_code,
    booking_code: payment.booking_code,
    guest_full_name: payment.guest_full_name,
    guest_phone: payment.guest_phone,
    guest_email: payment.guest_email,
    check_in_date: payment.check_in_date,
    check_out_date: payment.check_out_date,
    adults: Number(payment.adults),
    children: Number(payment.children),
    booking_status: payment.booking_status,
    booking_total_amount: Number(payment.booking_total_amount),
    booking_deposit_amount: Number(payment.booking_deposit_amount),
    customer_full_name: payment.customer_full_name,
    customer_email: payment.customer_email,
    customer_phone: payment.customer_phone,
    booking_rooms: parseJsonArray(payment.booking_rooms),
    booking_guests: parseJsonArray(payment.booking_guests),
    invoice_number: payment.invoice_number,
    invoice_room_amount: payment.invoice_room_amount == null ? null : Number(payment.invoice_room_amount),
    invoice_service_amount: payment.invoice_service_amount == null ? null : Number(payment.invoice_service_amount),
    invoice_discount_amount: payment.invoice_discount_amount == null ? null : Number(payment.invoice_discount_amount),
    invoice_tax_amount: payment.invoice_tax_amount == null ? null : Number(payment.invoice_tax_amount),
    invoice_total_amount: payment.invoice_total_amount == null ? null : Number(payment.invoice_total_amount),
    invoice_deposit_paid: payment.invoice_deposit_paid == null ? null : Number(payment.invoice_deposit_paid),
    invoice_amount_due: payment.invoice_amount_due == null ? null : Number(payment.invoice_amount_due),
    invoice_status: payment.invoice_status,
    invoice_issued_at: payment.invoice_issued_at,
    invoice_items: parseJsonArray(payment.invoice_items),
    payment_type: payment.payment_type,
    method: payment.method,
    amount: Number(payment.amount),
    status: payment.status,
    paid_at: payment.paid_at,
    vnpay_transaction_no: payment.vnpay_transaction_no,
  }));
}

async function getPaymentList(_req, res) {
  try {
    const payments = await getPayments();
    return res.json(serializePayments(payments));
  } catch (error) {
    console.error('Get payment list error:', error);
    return res.status(500).json({ message: 'Không thể tải danh sách thanh toán.' });
  }
}

async function getCustomerPaymentList(req, res) {
  try {
    const payments = await getCustomerPayments(req.auth.userId);
    return res.json(serializePayments(payments));
  } catch (error) {
    console.error('Get customer payment list error:', error);
    return res.status(500).json({ message: 'Không thể tải lịch sử thanh toán của bạn.' });
  }
}

async function confirmPaymentRequest(req, res) {
  try {
    const paymentCode = String(req.params?.paymentCode || '').trim();
    if (!paymentCode) {
      return res.status(400).json({ message: 'Thiếu mã thanh toán cần xác nhận.' });
    }

    const result = await confirmPayment(paymentCode);
    return res.json({
      message: 'Xác nhận thanh toán thành công.',
      payment_code: result.payment_code,
      status: result.status,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    console.error('Confirm payment error:', error);
    return res.status(500).json({ message: 'Không thể xác nhận thanh toán.' });
  }
}

module.exports = { createPayment, getPaymentList, getCustomerPaymentList, confirmPaymentRequest };
