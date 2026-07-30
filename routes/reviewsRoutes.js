const express = require('express');
const { auth, authorize } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { getGoogleReviews, clearCache } = require('../controllers/reviewsController');

const router = express.Router();

// @desc   Google Places reviews/rating summary for active branches
// @route  GET /api/v1/reviews/google
router.get('/google', asyncHandler(getGoogleReviews));

// @desc   Force-refresh the cached reviews (admin only)
// @route  POST /api/v1/reviews/google/clear-cache
router.post('/google/clear-cache', auth, authorize('super_admin', 'superadmin'), clearCache);

module.exports = router;
