const reviewService = require('../services/reviewService');
const { toCreateReviewRequest } = require('../dto/review/create-review/create-review-request.dto');
const { toUpdateReviewRequest } = require('../dto/review/update-review/update-review-request.dto');
const { toReviewListResponse } = require('../dto/review/view-review-list/review-list-response.dto');
const { toCustomerReviewListResponse } = require('../dto/review/view-customer-review-list/customer-review-list-response.dto');
const { toReviewDetailsResponse } = require('../dto/review/view-review-details/review-details-response.dto');
const { toCreateReviewResponse } = require('../dto/review/create-review/create-review-response.dto');
const { toUpdateReviewResponse } = require('../dto/review/update-review/update-review-response.dto');

function sendError(res, error) {
  const status = Number(error.statusCode) || 500;
  if (status >= 500) console.error('Review request failed:', error);
  return res.status(status).json({ message: status >= 500 ? 'Không thể xử lý yêu cầu Review.' : error.message });
}

async function getDashboardReviews(req, res) {
  try { return res.json(toReviewListResponse(await reviewService.dashboardList(req.auth.roleCode))); }
  catch (error) { return sendError(res, error); }
}

async function getCustomerBookings(req, res) {
  try { return res.json(toCustomerReviewListResponse(await reviewService.customerBookings(req.auth.userId))); }
  catch (error) { return sendError(res, error); }
}

async function getMyReview(req, res) {
  try { return res.json(toReviewDetailsResponse(await reviewService.getMine(req.params.reviewId, req.auth.userId))); }
  catch (error) { return sendError(res, error); }
}

async function createReview(req, res) {
  try { return res.status(201).json(toCreateReviewResponse(await reviewService.create(toCreateReviewRequest(req.body), req.auth.userId))); }
  catch (error) { return sendError(res, error); }
}

async function updateReview(req, res) {
  try { return res.json(toUpdateReviewResponse(await reviewService.update(req.params.reviewId, toUpdateReviewRequest(req.body), req.auth.userId))); }
  catch (error) { return sendError(res, error); }
}

async function deleteReview(req, res) {
  try { return res.json(await reviewService.remove(req.params.reviewId)); }
  catch (error) { return sendError(res, error); }
}

async function deleteMyReview(req, res) {
  try { return res.json(await reviewService.removeMine(req.params.reviewId, req.auth.userId)); }
  catch (error) { return sendError(res, error); }
}

module.exports = { getDashboardReviews, getCustomerBookings, getMyReview, createReview, updateReview, deleteReview, deleteMyReview };
