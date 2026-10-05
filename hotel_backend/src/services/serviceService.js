const serviceDao = require('../dao/serviceDao');

function validateService(data) {
    if (!data || typeof data.name !== 'string' || !data.name.trim()) {
        throw new Error('Service name is required.');
    }
    if (data.price === undefined || data.price === null || data.price === '') {
        throw new Error('Service price is required.');
    }
    if (!Number.isFinite(Number(data.price))) {
        throw new Error('Service price must be a valid number.');
    }
    if (Number(data.price) < 0) {
        throw new Error('Service price cannot be negative.');
    }
    if (typeof data.unit !== 'string' || !data.unit.trim()) {
        throw new Error('Service unit is required.');
    }
    if (data.description != null && typeof data.description !== 'string') {
        throw new Error('Service description must be text.');
    }
    if (data.is_active != null && typeof data.is_active !== 'boolean') {
        throw new Error('Service status must be active or inactive.');
    }
}

async function getAllServices() {
    return await serviceDao.findAll();
}

async function getActiveServices() {
    return await serviceDao.findActive();
}

async function getServiceById(id) {
    const service = await serviceDao.findById(id);
    if (!service) {
        throw new Error('Service not found.');
    }
    return service;
}

async function createService(data) {
    validateService(data);
    return await serviceDao.create({
        name: data.name.trim(),
        description: data.description ? data.description.trim() : '',
        price: Number(data.price),
        unit: data.unit.trim(),
        is_active: data.is_active !== false
    });
}

async function updateService(id, data) {
    validateService(data);
    const existing = await serviceDao.findById(id);
    if (!existing) {
        throw new Error('Service not found.');
    }
    return await serviceDao.update(id, {
        name: data.name.trim(),
        description: data.description ? data.description.trim() : '',
        price: Number(data.price),
        unit: data.unit.trim(),
        is_active: data.is_active !== false
    });
}

async function deleteService(id) {
    const existing = await serviceDao.findById(id);
    if (!existing) {
        throw new Error('Service not found.');
    }
    return await serviceDao.softDelete(id);
}

module.exports = {
    getAllServices,
    getActiveServices,
    getServiceById,
    createService,
    updateService,
    deleteService
};
