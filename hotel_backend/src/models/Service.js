class Service {
    constructor(id, name, description, price, unit, is_active) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.price = price;
        this.unit = unit;
        this.is_active = is_active;
    }
}

module.exports = Service;