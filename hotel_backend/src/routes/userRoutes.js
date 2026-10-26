const express = require('express');
const userController = require('../controllers/userController');
const staffController = require('../controllers/staffController');
const profileController = require('../controllers/profileController');
const { getAdminStatistics } = require('../controllers/statisticsController');
const { requireAdmin, requireStaffReadAccess } = require('../middlewares/roleMiddleware');
const { requireProfileAccess } = require('../middlewares/customerAuth');

const router = express.Router();
router.get('/admin/statistics', requireAdmin, getAdminStatistics);
router.get('/admin/users', requireAdmin, userController.getUserList);
router.get('/admin/users/:id', requireAdmin, userController.getUserDetails);
router.post('/admin/users', requireAdmin, userController.createUser);
router.put('/admin/users/:id', requireAdmin, userController.updateUser);
router.patch('/admin/users/:id/lock', requireAdmin, userController.lockUser);
router.patch('/admin/users/:id/unlock', requireAdmin, userController.unlockUser);
router.patch('/admin/users/:id/role', requireAdmin, userController.assignUserRole);
router.get('/profile', requireProfileAccess, profileController.getProfile);
router.put('/profile', requireProfileAccess, profileController.updateProfile);
router.get('/staff', requireStaffReadAccess, staffController.getStaffList);
router.get('/staff/:staffId', requireStaffReadAccess, staffController.getStaffDetails);
router.put('/staff/:staffId', requireAdmin, staffController.updateStaffInfo);
router.patch('/staff/:staffId/status', requireAdmin, staffController.updateStaffStatus);

module.exports = router;
