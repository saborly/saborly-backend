// routes/bannerRoutes.js
const express = require('express');
const router = express.Router();
const bannerController = require('../controllers/bannerController');
const { auth, authorize } = require('../middleware/auth');
const { attachBranchToRequest, resolveBranchContext } = require('../middleware/branchContext');

router.get(
  '/active',
  attachBranchToRequest,
  resolveBranchContext,
  bannerController.getActiveBanners
);

router.get(
  '/getall',
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  authorize('admin', 'manager'),
  bannerController.getAllBanners
);

router.get(
  '/:id',
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  authorize('admin', 'manager'),
  bannerController.getBannerById
);

router.post(
  '/',
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  authorize('admin', 'manager'),
  bannerController.createBanner
);

router.put(
  '/:id',
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  authorize('admin', 'manager'),
  bannerController.updateBanner
);

router.delete(
  '/:id',
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  authorize('admin', 'manager'),
  bannerController.deleteBanner
);

router.patch(
  '/:id/toggle-status',
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  authorize('admin', 'manager'),
  bannerController.toggleBannerStatus
);

router.post(
  '/reorder',
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  authorize('admin', 'manager'),
  bannerController.reorderBanners
);

module.exports = router;
