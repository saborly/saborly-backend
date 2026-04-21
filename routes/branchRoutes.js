const express = require('express');
const { body, param, validationResult } = require('express-validator');
const Branch = require('../models/Branch');
const { auth, authorize } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { isSuperAdmin } = require('../utils/roles');

const router = express.Router();

// @desc   List active branches (branch picker — public)
// @route  GET /api/v1/branches/public
router.get(
  '/public',
  asyncHandler(async (req, res) => {
    const branches = await Branch.find({ isActive: true })
      .sort({ name: 1 })
      .select('name location address currency language timezone isActive')
      .lean();

    res.json({ success: true, count: branches.length, branches });
  })
);

// @desc   List branches (admin: all for super_admin, else own)
// @route  GET /api/v1/branches
router.get(
  '/',
  auth,
  asyncHandler(async (req, res) => {
    let query = {};
    if (!isSuperAdmin(req.user.role)) {
      query._id = req.user.branchId;
    }
    const branches = await Branch.find(query).sort({ name: 1 }).lean();
    res.json({ success: true, count: branches.length, branches });
  })
);

// @desc   Create branch
// @route  POST /api/v1/branches
router.post(
  '/',
  auth,
  authorize('super_admin', 'superadmin'),
  [
    body('name').trim().notEmpty(),
    body('location').optional().trim(),
    body('currency').optional().isLength({ min: 3, max: 3 }),
    body('language').optional().trim(),
    body('timezone').optional().trim(),
    body('phone').optional().trim(),
    body('settings').optional().isObject(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    const branch = await Branch.create(req.body);
    res.status(201).json({ success: true, branch });
  })
);

// @desc   Update branch
// @route  PUT /api/v1/branches/:id
router.put(
  '/:id',
  auth,
  authorize('super_admin', 'superadmin'),
  param('id').isMongoId(),
  [
    body('name').optional().trim().notEmpty(),
    body('location').optional().trim(),
    body('currency').optional().isLength({ min: 3, max: 3 }),
    body('language').optional().trim(),
    body('timezone').optional().trim(),
    body('phone').optional().trim(),
    body('settings').optional(),
    body('isActive').optional().isBoolean(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    const branch = await Branch.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }
    res.json({ success: true, branch });
  })
);

module.exports = router;
