const BaseModel = require('./baseModel');

class EmailVerificationModel extends BaseModel {
  static get schema() {
    return {
      name: 'EmailVerificationModel', table: 'email_verifications', primaryKey: 'id',
      fields: ['id', 'user_id', 'token', 'type', 'expires_at', 'used_at', 'created_at'],
    };
  }
}

module.exports = EmailVerificationModel;
