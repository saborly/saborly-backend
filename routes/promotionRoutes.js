// routes/promotionRoutes.js
const express = require('express');
const router = express.Router();
const promotionController = require('../controllers/promotionController');
const { auth, authorize } = require('../middleware/auth');

// Public — clicked from inside the email, no auth
router.get('/unsubscribe', promotionController.unsubscribe);

// Promotions reach customers across every branch, so these don't use branch-context middleware.
router.get(
  '/recipients/count',
  auth,
  authorize('admin', 'manager'),
  promotionController.getRecipientCount
);

router.get(
  '/recipients',
  auth,
  authorize('admin', 'manager'),
  promotionController.getRecipients
);

router.post(
  '/send',
  auth,
  authorize('admin', 'manager'),
  promotionController.sendPromotion
);

module.exports = router;
