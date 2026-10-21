const serviceDao = require('../dao/serviceDao');
const ServiceModel = require('../models/serviceModel');



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
    return serviceDao.create(ServiceModel.normalizeInput(data));
}

async function updateService(id, data) {
    const existing = await serviceDao.findById(id);
    if (!existing) throw new Error('Service not found.');
    return serviceDao.update(id, ServiceModel.normalizeInput(data, existing.booking_policy || 'ON_DEMAND'));
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
