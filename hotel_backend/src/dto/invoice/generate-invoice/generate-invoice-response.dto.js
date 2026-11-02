function toGenerateInvoiceResponse(invoice) { return { success: true, message: invoice.created ? 'Đã tạo hóa đơn.' : 'Booking đã có hóa đơn.', ...invoice }; }
module.exports = { toGenerateInvoiceResponse };
