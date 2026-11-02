function parseJsonList(value) {
  return value ? (Array.isArray(value) ? value : JSON.parse(value)) : [];
}

function toInvoiceDetailsResponse(invoice) {
  return {
    ...invoice,
    id: Number(invoice.id),
    room_amount: Number(invoice.room_amount),
    service_amount: Number(invoice.service_amount),
    discount_amount: Number(invoice.discount_amount),
    tax_amount: Number(invoice.tax_amount),
    total_amount: Number(invoice.total_amount),
    deposit_paid: Number(invoice.deposit_paid),
    amount_due: Number(invoice.amount_due),
    items: parseJsonList(invoice.items).map((item) => ({
      ...item,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      amount: Number(item.amount),
    })),
    adults: Number(invoice.adults),
    children: Number(invoice.children),
    payments: parseJsonList(invoice.payments).map((payment) => ({ ...payment, amount: Number(payment.amount) })),
    rooms: parseJsonList(invoice.rooms),
  };
}
module.exports = { toInvoiceDetailsResponse };
