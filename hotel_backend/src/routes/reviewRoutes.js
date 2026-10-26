const express = require('express');
const reviewController = require('../controllers/reviewController');
const { getReviews } = require('../controllers/homeController');
const { requireCustomer, requireReviewStaff } = require('../middlewares/customerAuth');
const { requireAdmin } = require('../middlewares/roleMiddleware');

const router = express.Router();
router.get('/reviews/dashboard', requireReviewStaff, reviewController.getDashboardReviews);
router.get('/reviews/my-bookings', requireCustomer, reviewController.getCustomerBookings);
router.get('/reviews/mine/:reviewId', requireCustomer, reviewController.getMyReview);
router.post('/reviews', requireCustomer, reviewController.createReview);
router.put('/reviews/mine/:reviewId', requireCustomer, reviewController.updateReview);
router.delete('/reviews/mine/:reviewId', requireCustomer, reviewController.deleteMyReview);
router.delete('/reviews/:reviewId', requireAdmin, reviewController.deleteReview);
router.get('/reviews', getReviews);

module.exports = router;
