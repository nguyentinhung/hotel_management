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

  static fromResult(result) {
    if (Array.isArray(result)) return this.fromRows(result);
    if (result == null || typeof result !== 'object' || Buffer.isBuffer(result)) return result;

    const prototype = Object.getPrototypeOf(result);
    if (prototype !== Object.prototype && prototype !== null) return result;
    return this.fromRow(result);
  }

  toJSON() {
    return { ...this };
  }
}

module.exports = BaseModel;
