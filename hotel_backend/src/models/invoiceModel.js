const BaseModel = require('./baseModel');

class InvoiceModel extends BaseModel {
  static parseJsonList(value) {
    return value ? (Array.isArray(value) ? value : JSON.parse(value)) : [];
  }

  static normalizeListItem(invoice) {
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
      items: this.parseJsonList(invoice.items).map((item) => ({
        ...item,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        amount: Number(item.amount),
      })),
    };
  }

  static normalizeDetails(invoice) {
    return {
      ...this.normalizeListItem(invoice),
      adults: Number(invoice.adults),
      children: Number(invoice.children),
      payments: this.parseJsonList(invoice.payments).map((payment) => ({
        ...payment,
        amount: Number(payment.amount),
      })),
      rooms: this.parseJsonList(invoice.rooms),
    };
  }

  static get schema() {
    return {"name":"InvoiceModel","table":"invoices","primaryKey":"id","fields":["id","booking_id","invoice_number","status","room_amount","service_amount","total_amount","created_at"]};
  }
}

module.exports = InvoiceModel;
