const serviceService = require('../services/serviceService');
const { toAddServiceRequest } = require('../dto/service/add-service/add-service-request.dto');
const { toUpdateServiceRequest } = require('../dto/service/update-service/update-service-request.dto');
const { toServiceListResponse } = require('../dto/service/view-service-list/service-list-response.dto');
const { toServiceDetailsResponse } = require('../dto/service/view-service-details/service-details-response.dto');
const { toAddServiceResponse } = require('../dto/service/add-service/add-service-response.dto');
const { toUpdateServiceResponse } = require('../dto/service/update-service/update-service-response.dto');
const { toDeleteServiceResponse } = require('../dto/service/delete-service/delete-service-response.dto');

const getServices = async (req, res) => {
    try {
        const services = await serviceService.getAllServices();
        res.json(toServiceListResponse(services));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getServiceById = async (req, res) => {
    try {
        const service = await serviceService.getServiceById(req.params.id);
        res.json(toServiceDetailsResponse(service));
    } catch (error) {
        res.status(error.message === 'Service not found.' ? 404 : 500).json({ message: error.message });
    }
};

const createService = async (req, res) => {
    try {
        const service = await serviceService.createService(toAddServiceRequest(req.body));
        res.status(201).json(toAddServiceResponse(service));
    } catch (error) {
        res.status(error.message === 'Service not found.' ? 404 : 400).json({ message: error.message });
    }
};

const updateService = async (req, res) => {
    try {
        const service = await serviceService.updateService(req.params.id, toUpdateServiceRequest(req.body));
        if (!service) {
            return res.status(404).json({ message: 'Service not found' });
        }
        res.json(toUpdateServiceResponse(service));
    } catch (error) {
        res.status(error.message === 'Service not found.' ? 404 : 400).json({ message: error.message });
    }
};

const deleteService = async (req, res) => {
    try {
        const result = await serviceService.deleteService(req.params.id);
        if (!result) {
            return res.status(404).json({ message: 'Service not found' });
        }
        res.json(toDeleteServiceResponse());
    } catch (error) {
        res.status(error.message === 'Service not found.' ? 404 : 500).json({ message: error.message });
    }
};

module.exports = {
    getServices,
    getServiceById,
    createService,
    updateService,
    deleteService
};
