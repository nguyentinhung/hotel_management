const serviceDao = require('../dao/serviceDao');
const ServiceModel = require('../models/serviceModel');



async function getAllServices() {
    return ServiceModel.fromResult(await serviceDao.findAll());
}

async function getActiveServices() {
    return ServiceModel.fromResult(await serviceDao.findActive());
}

async function getServiceById(id) {
    const service = await serviceDao.findById(id);
    if (!service) {
        throw new Error('Service not found.');
    }
    return ServiceModel.fromResult(service);
}

async function createService(data) {
    return ServiceModel.fromResult(await serviceDao.create(ServiceModel.normalizeInput(data)));
}

async function updateService(id, data) {
    const existing = await serviceDao.findById(id);
    if (!existing) throw new Error('Service not found.');
    return ServiceModel.fromResult(await serviceDao.update(id, ServiceModel.normalizeInput(data, existing.booking_policy || 'ON_DEMAND')));
}

async function deleteService(id) {
    const existing = await serviceDao.findById(id);
    if (!existing) {
        throw new Error('Service not found.');
    }
    return ServiceModel.fromResult(await serviceDao.softDelete(id));
}

module.exports = {
    getAllServices,
    getActiveServices,
    getServiceById,
    createService,
    updateService,
    deleteService
};
