function toConfirmPaymentResponse(result) { return { message: 'Xác nhận thanh toán thành công.', payment_code: result.payment_code, status: result.status }; }
module.exports = { toConfirmPaymentResponse };
