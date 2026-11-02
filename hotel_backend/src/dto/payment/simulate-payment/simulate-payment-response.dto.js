function toSimulatePaymentResponse(succeeded, result) { return { message: succeeded ? 'Mô phỏng thanh toán cọc thành công.' : 'Mô phỏng giao dịch thất bại.', ...result }; }
module.exports = { toSimulatePaymentResponse };
