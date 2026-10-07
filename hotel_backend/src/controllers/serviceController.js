const serviceService = require('../services/serviceService');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'hotel-management-secret';
const roleCodeById = { 1: 'CUSTOMER', 2: 'RECEPTIONIST', 3: 'HOUSEKEEPER', 4: 'ADMIN' };

function requireAdmin(req, res, next) {
    const authorization = req.headers.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token) return res.status(401).json({ message: 'Vui lòng đăng nhập để tiếp tục.' });

    try {
        const claims = jwt.verify(token, JWT_SECRET);
        const roleCode = roleCodeById[Number(claims.role_id)] || String(claims.role_code || '').toUpperCase();
        if (roleCode !== 'ADMIN') {
            return res.status(403).json({ message: 'Chỉ quản trị viên được quản lý dịch vụ.' });
        }
        return next();
    } catch {
        return res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
    }
}

const getServices = async (req, res) => {
    try {
        const services = await serviceService.getAllServices();
        res.json(services);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getServiceById = async (req, res) => {
    try {
        const service = await serviceService.getServiceById(req.params.id);
        res.json(service);
    } catch (error) {
        res.status(error.message === 'Service not found.' ? 404 : 500).json({ message: error.message });
    }
};

const createService = async (req, res) => {
    try {
        const service = await serviceService.createService(req.body);
        res.status(201).json(service);
    } catch (error) {
        res.status(error.message === 'Service not found.' ? 404 : 400).json({ message: error.message });
    }
};

const updateService = async (req, res) => {
    try {
        const service = await serviceService.updateService(req.params.id, req.body);
        if (!service) {
            return res.status(404).json({ message: 'Service not found' });
        }
        res.json(service);
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
        res.json({ message: 'Service deleted successfully' });
    } catch (error) {
        res.status(error.message === 'Service not found.' ? 404 : 500).json({ message: error.message });
    }
};

module.exports = {
    requireAdmin,
    getServices,
    getServiceById,
    createService,
    updateService,
    deleteService
};
