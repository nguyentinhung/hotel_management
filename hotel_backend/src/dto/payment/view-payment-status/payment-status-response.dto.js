function toPaymentStatusResponse(payment) { return { payment_code: payment.payment_code, booking_code: payment.booking_code, payment_type: payment.payment_type, amount: Number(payment.amount), status: payment.status, invoice_id: payment.invoice_id == null ? null : Number(payment.invoice_id) }; }
module.exports = { toPaymentStatusResponse };
