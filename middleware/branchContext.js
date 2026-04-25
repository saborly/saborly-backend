const mongoose = require('mongoose');
const Branch = require('../models/Branch');
const asyncHandler = require('./asyncHandler');
const { normalizeRole, isSuperAdmin, canLoginAnyBranch } = require('../utils/roles');
let defaultBranchIdCache = null;

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

async function resolveDefaultBranchId() {
  if (defaultBranchIdCache && mongoose.Types.ObjectId.isValid(defaultBranchIdCache)) {
    return defaultBranchIdCache;
  }

  const defaultBranch = await Branch.findOne({
    isActive: true,
    $or: [
      { name: /barcelona/i },
      { name: /saborly_main/i },
      { phone: '+34932112072' },
      { location: /barcelona/i },
    ],
  })
    .select('_id')
    .lean();

  if (defaultBranch?._id) {
    defaultBranchIdCache = defaultBranch._id.toString();
    return defaultBranchIdCache;
  }

  return null;
}

/** Attach raw client branch id (header / body / query) without validating */
const attachBranchToRequest = (req, res, next) => {
  req.clientBranchId = readBranchIdFromRequest(req);
  next();
};

/**
 * Resolve and validate branch; sets req.branchId (ObjectId) and req.branchDoc.
 *
 * Cross-branch roles (super_admin, superadmin, admin — same set as canLoginAnyBranch):
 *   - May override the branch via X-Branch-Id header.
 *   - If no header, fall back to the user's home branchId from the DB.
 *
 * Branch-bound roles (staff, user):
 *   - Must match their account's branchId; any differing header is rejected.
 */
const resolveBranchContext = asyncHandler(async (req, res, next) => {
  let branchIdStr = req.clientBranchId;

  if (req.user) {
    const ub = userBranchIdString(req.user);
    const crossBranch = isSuperAdmin(req.user.role) || canLoginAnyBranch(req.user.role);

    if (crossBranch) {
      // 1) X-Branch-Id  2) JWT session from login  3) home branch in DB
      if (!branchIdStr) {
        const jwtB = req.user.sessionBranchId;
        if (jwtB && String(jwtB).trim()) branchIdStr = String(jwtB).trim();
      }
      if (!branchIdStr && ub) branchIdStr = ub;
    } else {
      // Staff / customer: always stay on their own branch.
      // If client sends a different branchId, ignore it instead of hard-failing.
      if (!branchIdStr || (ub && branchIdStr !== ub)) {
        branchIdStr = ub;
      }
    }
  }

  if (!branchIdStr) {
    const defaultBranchId = await resolveDefaultBranchId();
    if (defaultBranchId) {
      branchIdStr = defaultBranchId;
    } else {
      return res.status(400).json({
        success: false,
        message:
          'branchId is required and default Barcelona branch was not found',
      });
    }
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

  req.branchId = new mongoose.Types.ObjectId(branchIdStr);
  req.branchDoc = branch;
  next();
});

module.exports = {
  attachBranchToRequest,
  resolveBranchContext,
  readBranchIdFromRequest,
};
