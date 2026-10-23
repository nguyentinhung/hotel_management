const BaseModel = require('./baseModel');

class UserModel extends BaseModel {
  static normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  static isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
  }

  static isValidPhone(phone) {
    return /^\+?[0-9\s\-()]{9,20}$/.test(String(phone || '').trim());
  }

  static normalizePhone(phone) {
    return String(phone || '').trim();
  }

  static get schema() {
    return { name: 'UserModel', table: 'users', primaryKey: 'id' };
  }
}

module.exports = UserModel;
