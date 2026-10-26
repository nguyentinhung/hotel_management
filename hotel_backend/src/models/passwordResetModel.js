const BaseModel = require('./baseModel');

class PasswordResetModel extends BaseModel {
  static get schema() {
    return {
      name: 'PasswordResetModel', table: 'password_resets', primaryKey: 'id',
      fields: ['id', 'user_id', 'otp_code', 'token', 'expires_at', 'is_used', 'created_at'],
    };
  }
}

module.exports = PasswordResetModel;
