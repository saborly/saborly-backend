const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactcontroller');
const { auth, authorize, optionalAuth } = require('../middleware/auth');
const { attachBranchToRequest, resolveBranchContext } = require('../middleware/branchContext');

// Public — Submit contact form
router.post(
  '/',
  attachBranchToRequest,
  optionalAuth,
  resolveBranchContext,
  contactController.submitContactForm
);

router.get(
  '/',
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  authorize('admin', 'manager'),
  contactController.getAllContacts
);

router.get(
  '/stats',
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  authorize('admin', 'manager'),
  contactController.getContactStats
);

router.get(
  '/:id',
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  authorize('admin', 'manager'),
  contactController.getContactById
);

router.put(
  '/:id/status',
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  authorize('admin', 'manager'),
  contactController.updateContactStatus
);

router.post(
  '/:id/reply',
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  authorize('admin', 'manager'),
  contactController.replyToContact
);

router.delete(
  '/:id',
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  authorize('admin', 'manager'),
  contactController.deleteContact
);

module.exports = router;
