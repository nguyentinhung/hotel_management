const BaseModel = require('./baseModel');

class HomeModel extends BaseModel {
  static get schema() {
    return {"name":"HomeModel","table":null,"primaryKey":null,"fields":["room_types","promotions","services","reviews"]};
  }
}

module.exports = HomeModel;
