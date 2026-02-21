const express = require('express');
const router = express.Router();
const {
  proxyImage,
  handleOptions,
  clearCache,
  getCacheStats,
} = require('../controllers/imageProxyController');

// Simple auth middleware for admin endpoints
const adminAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  // Store your admin API key in environment variable
  if (apiKey === process.env.ADMIN_API_KEY) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// Main proxy endpoint
router.get('/image', proxyImage);
router.options('/image', handleOptions);

// Admin endpoints (protected)
router.post('/cache/clear', adminAuth, clearCache);
router.get('/cache/stats', adminAuth, getCacheStats);

module.exports = router;