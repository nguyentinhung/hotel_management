const serviceDao = require('../dao/serviceDao');

function normalizeServiceInput(input, fallbackPolicy = 'ON_DEMAND') {
    if (!input || typeof input.name !== 'string' || !input.name.trim()) {
        throw new Error('Service name is required.');
    }
    if (input.price === undefined || input.price === null || input.price === '') {
        throw new Error('Service price is required.');
    }
    if (!Number.isFinite(Number(input.price))) throw new Error('Service price must be a valid number.');
    if (Number(input.price) < 0) throw new Error('Service price cannot be negative.');
    if (typeof input.unit !== 'string' || !input.unit.trim()) throw new Error('Service unit is required.');
    if (input.description != null && typeof input.description !== 'string') throw new Error('Service description must be text.');
    if (input.is_active != null && typeof input.is_active !== 'boolean') throw new Error('Service status must be active or inactive.');
    if (input.booking_policy != null && !['PREBOOK', 'ON_DEMAND'].includes(input.booking_policy)) {
      throw new Error('Service booking policy must be PREBOOK or ON_DEMAND.');
    }
    return {
      name: input.name.trim(),
      description: input.description ? input.description.trim() : '',
      price: Number(input.price),
      unit: input.unit.trim(),
      is_active: input.is_active !== false,
      booking_policy: input.booking_policy || fallbackPolicy,
    };
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
    return await serviceDao.create(normalizeServiceInput(data));
}

async function updateService(id, data) {
    const existing = await serviceDao.findById(id);
    if (!existing) throw new Error('Service not found.');
    return await serviceDao.update(id, normalizeServiceInput(data, existing.booking_policy || 'ON_DEMAND'));
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
