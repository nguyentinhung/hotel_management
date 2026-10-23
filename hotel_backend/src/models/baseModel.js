/** Base class for SQL-backed domain models. DAO remains responsible for SQL queries. */
class BaseModel {
  constructor(data = {}) {
    Object.assign(this, data);
  }

  static fromRow(row) {
    return row == null ? null : new this(row);
  }

  static fromRows(rows = []) {
    return rows.map((row) => this.fromRow(row));
  }

  toJSON() {
    return { ...this };
  }
}

module.exports = BaseModel;
