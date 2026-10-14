class Promotion {
  constructor(id, code, name, description, discount_type, discount_value, max_discount, valid_from, valid_to, is_active) {
    this.id = id;
    this.code = code;
    this.name = name;
    this.description = description;
    this.discount_type = discount_type;
    this.discount_value = discount_value;
    this.max_discount = max_discount;
    this.valid_from = valid_from;
    this.valid_to = valid_to;
    this.is_active = is_active;
  }
}

module.exports = Promotion;
