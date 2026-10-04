const { getPool } = require('../config/db');

async function findAll() {
    const pool = await getPool();
    const result = await pool.request().query(`
        SELECT
            id,
            name,
            description,
            price,
            unit,
            is_active
        FROM services
        WHERE is_deleted = 0
        ORDER BY id;
    `);
    return result.recordset;
}

async function findActive() {
    const pool = await getPool();
    const result = await pool.request().query(`
        SELECT
            id,
            name,
            description,
            price,
            unit,
            is_active
        FROM services
        WHERE is_active = 1 AND is_deleted = 0
        ORDER BY id;
    `);
    return result.recordset;
}

async function findById(id) {
    const pool = await getPool();
    const result = await pool.request()
        .input('id', id)
        .query(`
            SELECT
                id,
                name,
                description,
                price,
                unit,
                is_active
            FROM services
            WHERE id = @id AND is_deleted = 0;
        `);
    return result.recordset[0] || null;
}

async function create(service) {
    const pool = await getPool();
    const result = await pool.request()
        .input('name', service.name)
        .input('description', service.description)
        .input('price', service.price)
        .input('unit', service.unit)
        .input('is_active', service.is_active)
        .query(`
            INSERT INTO services
            (
                name,
                description,
                price,
                unit,
                is_active
            )
            OUTPUT
                INSERTED.id,
                INSERTED.name,
                INSERTED.description,
                INSERTED.price,
                INSERTED.unit,
                INSERTED.is_active
            VALUES
            (
                @name,
                @description,
                @price,
                @unit,
                @is_active
            );
        `);
    return result.recordset[0];
}

async function update(id, service) {
    const pool = await getPool();
    const result = await pool.request()
        .input('id', id)
        .input('name', service.name)
        .input('description', service.description)
        .input('price', service.price)
        .input('unit', service.unit)
        .input('is_active', service.is_active)
        .query(`
            UPDATE services
            SET
                name = @name,
                description = @description,
                price = @price,
                unit = @unit,
                is_active = @is_active
            OUTPUT
                INSERTED.id,
                INSERTED.name,
                INSERTED.description,
                INSERTED.price,
                INSERTED.unit,
                INSERTED.is_active
            WHERE id = @id AND is_deleted = 0;
        `);
    return result.recordset[0] || null;
}

// Xóa mềm: chỉ đánh dấu is_deleted = 1, KHÔNG xóa dòng nào trong database
// nên lịch sử sử dụng dịch vụ ở các bảng liên quan vẫn còn nguyên.
async function softDelete(id) {
    const pool = await getPool();
    const result = await pool.request()
        .input('id', id)
        .query(`
            UPDATE services
            SET is_deleted = 1,
                is_active = 0
            OUTPUT
                INSERTED.id,
                INSERTED.name,
                INSERTED.description,
                INSERTED.price,
                INSERTED.unit,
                INSERTED.is_active
            WHERE id = @id AND is_deleted = 0;
        `);
    return result.recordset[0] || null;
}

module.exports = {
    findAll,
    findActive,
    findById,
    create,
    update,
    softDelete
};