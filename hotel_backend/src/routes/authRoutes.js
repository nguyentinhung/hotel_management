const express = require('express');
const authController = require('../controllers/authController');
const { requireChangePassword } = require('../middlewares/customerAuth');

const router = express.Router();
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.post('/auth/logout', authController.logout);
router.get('/auth/verify-email', authController.verifyEmail);
router.post('/auth/forgot-password', authController.forgotPassword);
router.post('/auth/change-password', requireChangePassword, authController.changePassword);
router.post('/auth/reset-password', authController.resetPassword);

module.exports = router;
