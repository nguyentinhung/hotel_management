const BaseModel = require('./baseModel');

class InvoiceItemModel extends BaseModel {
  static normalize(item = {}) {
    return new this({
      ...item,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      amount: Number(item.amount),
    });
  }

  static get schema() {
    return {
      name: 'InvoiceItemModel',
      table: 'invoice_items',
      primaryKey: 'id',
      fields: ['id', 'invoice_id', 'item_type', 'description', 'quantity', 'unit_price', 'amount'],
    };
  }
}

module.exports = InvoiceItemModel;
