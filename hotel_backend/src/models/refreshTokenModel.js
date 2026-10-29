const BaseModel = require('./baseModel');

/** Persisted refresh-token record used to create and revoke login sessions. */
class RefreshTokenModel extends BaseModel {
  static get schema() {
    return {
      name: 'RefreshTokenModel',
      table: 'refresh_tokens',
      primaryKey: 'id',
      fields: ['id', 'user_id', 'token', 'expires_at', 'revoked_at', 'created_at'],
    };
  }
}

module.exports = RefreshTokenModel;
