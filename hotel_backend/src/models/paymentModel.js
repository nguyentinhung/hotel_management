const crypto = require('crypto');
const BaseModel = require('./baseModel');

class PaymentModel extends BaseModel {
  static generateCode() {
    return `PAY${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  }

  static normalizeMethod(method) {
    return String(method || '').toUpperCase();
  }
  static get schema() {
    return {"name":"PaymentModel","table":"payments","primaryKey":"id","fields":["id","booking_id","payment_code","payment_type","amount","method","status","paid_at","created_at"]};
  }
}

module.exports = PaymentModel;
