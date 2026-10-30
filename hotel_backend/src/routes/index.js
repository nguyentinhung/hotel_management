const express = require('express');

const router = express.Router();

router.use(require('./healthRoutes'));
router.use(require('./userRoutes'));
router.use(require('./authRoutes'));
router.use(require('./homeRoutes'));
router.use(require('./equipmentRoutes'));
router.use(require('./reviewRoutes'));
router.use(require('./roomRoutes'));
router.use(require('./bookingRoutes'));
router.use(require('./paymentRoutes'));
router.use(require('./roomTypeImageRoutes'));
router.use(require('./cleaningTaskRoutes'));

module.exports = router;
