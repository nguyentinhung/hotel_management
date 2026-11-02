function toMakePaymentResponse(payment) { return { payment_code: payment.payment_code, amount: Number(payment.amount), status: payment.status, payment_url: payment.payment_url }; }
module.exports = { toMakePaymentResponse };
