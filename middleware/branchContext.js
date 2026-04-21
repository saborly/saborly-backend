const mongoose = require('mongoose');
const Branch = require('../models/Branch');
const asyncHandler = require('./asyncHandler');
const { normalizeRole, isSuperAdmin } = require('../utils/roles');

function readBranchIdFromRequest(req) {
  const h = req.headers['x-branch-id'];
  if (h != null && String(h).trim()) return String(h).trim();
  if (req.body && req.body.branchId != null && req.body.branchId !== '') {
    return String(req.body.branchId).trim();
  }
  if (req.query && req.query.branchId != null && req.query.branchId !== '') {
    return String(req.query.branchId).trim();
  }
  return null;
}

function userBranchIdString(user) {
  if (!user || user.branchId == null) return null;
  return user.branchId.toString ? user.branchId.toString() : String(user.branchId);
}

/** Attach raw client branch id (header / body / query) without validating */
const attachBranchToRequest = (req, res, next) => {
  req.clientBranchId = readBranchIdFromRequest(req);
  next();
};

/**
 * Resolve and validate branch; sets req.branchId (ObjectId) and req.branchDoc.
 * Enforces: branch_admin/staff/user cannot access another branch via header.
 */
const resolveBranchContext = asyncHandler(async (req, res, next) => {
  let branchIdStr = req.clientBranchId;

  if (req.user) {
    const role = normalizeRole(req.user.role);
    const ub = userBranchIdString(req.user);

    if (isSuperAdmin(req.user.role)) {
      if (!branchIdStr && ub) branchIdStr = ub;
    } else if (role === 'branch_admin' || role === 'staff' || role === 'user') {
      if (!branchIdStr) branchIdStr = ub;
      else if (ub && branchIdStr !== ub) {
        return res.status(403).json({
          success: false,
          message: 'branchId does not match your account scope',
        });
      }
    }
  }

  if (!branchIdStr) {
    return res.status(400).json({
      success: false,
      message: 'branchId is required (X-Branch-Id header, or branchId in query/body)',
    });
  }

  if (!mongoose.Types.ObjectId.isValid(branchIdStr)) {
    return res.status(400).json({ success: false, message: 'Invalid branchId' });
  }

  const branch = await Branch.findById(branchIdStr).lean();
  if (!branch || branch.isActive === false) {
    return res.status(404).json({
      success: false,
      message: 'Branch not found or inactive',
    });
  }

  if (req.user && !isSuperAdmin(req.user.role)) {
    const role = normalizeRole(req.user.role);
    const ub = userBranchIdString(req.user);
    if ((role === 'branch_admin' || role === 'staff' || role === 'user') && ub && branchIdStr !== ub) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden for this branch',
      });
    }
  }

  req.branchId = new mongoose.Types.ObjectId(branchIdStr);
  req.branchDoc = branch;
  next();
});

module.exports = {
  attachBranchToRequest,
  resolveBranchContext,
  readBranchIdFromRequest,
};
