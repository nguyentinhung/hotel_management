const BaseModel = require('./baseModel');

class RoleModel extends BaseModel {
  static get schema() {
    return { name: 'RoleModel', table: 'roles', primaryKey: 'id', fields: ['id', 'code', 'name'] };
  }
}

module.exports = RoleModel;
