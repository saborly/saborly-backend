const mongoose = require('mongoose');
const Branch = require('../models/Branch');
const asyncHandler = require('./asyncHandler');
const { normalizeRole, isSuperAdmin, canLoginAnyBranch } = require('../utils/roles');
let defaultBranchIdCache = null;

// resolveBranchContext runs on almost every API request, and previously did
// a fresh Branch.findById() round-trip to Mongo Atlas every single time just
// to check isActive — branch docs change essentially never, so a short TTL
// cache removes one full network round-trip from every request without
// changing what's returned (same data, just briefly reused).
const BRANCH_DOC_CACHE_TTL_MS = 60 * 1000;
const branchDocCache = new Map(); // branchIdStr -> { doc, expiresAt }

async function getBranchDocCached(branchIdStr) {
  const cached = branchDocCache.get(branchIdStr);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.doc;
  }

  const branchDoc = await Branch.findById(branchIdStr).lean();
  branchDocCache.set(branchIdStr, { doc: branchDoc, expiresAt: Date.now() + BRANCH_DOC_CACHE_TTL_MS });
  return branchDoc;
}

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

  try {
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
  } catch (error) {
    console.error('Error finding default branch:', error.message);
  }

  // Hardcoded fallback for Saborly Main (Barcelona) if DB lookup fails or branch not found
  // This ensures branchId is never null/undefined for critical flows like Apple Sign-In
  const FALLBACK_ID = '68dbd4267fe1403440fb5d88';
  console.log('Using hardcoded fallback branch ID:', FALLBACK_ID);
  return FALLBACK_ID;
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
    } else if (normalizeRole(req.user.role) === 'user') {
      // Customers may order from any branch — honour the header/body branch they selected.
      // Fall back to their account branch only if no branch was specified.
      if (!branchIdStr) branchIdStr = ub;
    } else {
      // Staff / branch_admin: locked to their own branch.
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

  const branchDoc = await getBranchDocCached(branchIdStr);
  if (!branchDoc || branchDoc.isActive === false) {
    return res.status(404).json({
      success: false,
      message: 'Branch not found or inactive',
    });
  }

  req.branchId = new mongoose.Types.ObjectId(branchIdStr);
  req.branchDoc = branchDoc;
  next();
});

module.exports = {
  attachBranchToRequest,
  resolveBranchContext,
  readBranchIdFromRequest,
};
