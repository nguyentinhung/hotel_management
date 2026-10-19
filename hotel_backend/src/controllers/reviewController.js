const reviewService = require('../services/reviewService');

function sendError(res, error) {
  const status = Number(error.statusCode) || 500;
  if (status >= 500) console.error('Review request failed:', error);
  return res.status(status).json({ message: status >= 500 ? 'Không thể xử lý yêu cầu Review.' : error.message });
}

async function getDashboardReviews(req, res) {
  try { return res.json({ reviews: await reviewService.dashboardList(req.auth.roleCode) }); }
  catch (error) { return sendError(res, error); }
}

async function getCustomerBookings(req, res) {
  try { return res.json({ bookings: await reviewService.customerBookings(req.auth.userId) }); }
  catch (error) { return sendError(res, error); }
}

async function getMyReview(req, res) {
  try { return res.json(await reviewService.getMine(req.params.reviewId, req.auth.userId)); }
  catch (error) { return sendError(res, error); }
}

async function createReview(req, res) {
  try { return res.status(201).json(await reviewService.create(req.body, req.auth.userId)); }
  catch (error) { return sendError(res, error); }
}

async function updateReview(req, res) {
  try { return res.json(await reviewService.update(req.params.reviewId, req.body, req.auth.userId)); }
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
