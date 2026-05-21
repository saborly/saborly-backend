const jwt = require('jsonwebtoken');
const User = require('../models/User');
const asyncHandler = require('./asyncHandler');
const { normalizeRole, isSuperAdmin, canLoginAnyBranch } = require('../utils/roles');

// Protect routes - authenticate token
const auth = asyncHandler(async (req, res, next) => {
  let token;

  // Check for token in headers
  if (req.headers.authorization && req.headers.authorization.toLowerCase().startsWith('bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  // Make sure token exists
  if (!token) {
    console.log('Auth Middleware: No token provided in headers:', Object.keys(req.headers));
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if user still exists (use lean() and select only needed fields for better performance)
    const userId = decoded.userId || decoded.id;
    const user = await User.findById(userId).select('isActive lastActivity role email branchId').lean();
    
    if (!user) {
      console.log('Auth Middleware: No user found for ID:', userId);
      return res.status(401).json({
        success: false,
        message: 'No user found with this token'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      console.log('Auth Middleware: User is inactive:', user.email);
      return res.status(401).json({
        success: false,
        message: 'User account has been deactivated'
      });
    }

    // Check if user has been inactive for 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    if (user.lastActivity && new Date(user.lastActivity) < sevenDaysAgo) {
      console.log('Auth Middleware: Session expired due to inactivity for:', user.email);
      return res.status(401).json({
        success: false,
        message: 'Session expired due to inactivity. Please login again.'
      });
    }

    // Update last activity (optimized - only updates if > 1 min since last update)
    // Use direct updateOne for better performance (fire and forget)
    const now = new Date();
    const lastActivity = user.lastActivity ? new Date(user.lastActivity) : null;
    if (!lastActivity || (now - lastActivity) > 60000) {
      User.updateOne(
        { _id: userId },
        { $set: { lastActivity: now } }
      ).catch(() => {
        // Silently fail - don't log to avoid spam
      });
    }

    const sessionFromToken =
      decoded.branchId != null && String(decoded.branchId).trim() !== ''
        ? String(decoded.branchId).trim()
        : null;

    req.user = {
      id: userId.toString(),
      _id: user._id,
      isActive: user.isActive,
      lastActivity: user.lastActivity,
      role: user.role,
      email: user.email,
      branchId: user.branchId,
      /** Branch id embedded at login (generateAuthToken(sessionBranchId)) — not the user's home branch in DB */
      sessionBranchId: sessionFromToken,
    };
    next();
  } catch (error) {
    console.error('Auth Middleware Error:', error.message);
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      console.log('Auth Middleware: Invalid Token:', token?.substring(0, 10) + '...');
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    });
  }
});

// Grant access to specific roles
const authorize = (...roles) => {
  return (req, res, next) => {
    const ur = req.user.role;
    const un = normalizeRole(ur);

    // Org-level roles (super_admin + legacy admin) use the same back-office routes with branch scoping.
    if (isSuperAdmin(ur) || canLoginAnyBranch(ur)) {
      const allowsBranchDashboard = roles.some((r) => {
        const rn = normalizeRole(r);
        return (
          r === 'admin' ||
          rn === 'branch_admin' ||
          r === 'manager' ||
          rn === 'staff'
        );
      });
      if (allowsBranchDashboard) return next();
    }

    const allowed = roles.some((r) => {
      const rn = normalizeRole(r);
      if (rn === un) return true;
      if (r === ur) return true;
      if ((r === 'admin' || rn === 'branch_admin') && (ur === 'admin' || un === 'branch_admin')) return true;
      if ((r === 'manager' || rn === 'staff') && (ur === 'manager' || un === 'staff')) return true;
      if ((r === 'superadmin' || rn === 'super_admin') && (ur === 'superadmin' || un === 'super_admin')) return true;
      return false;
    });
    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to access this route`,
      });
    }
    next();
  };
};

// Optional auth - doesn't require authentication but adds user if token exists
const optionalAuth = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.toLowerCase().startsWith('bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const oid = decoded.userId || decoded.id;
      const user = await User.findById(oid).select('isActive lastActivity branchId role email').lean();
      
      if (user && user.isActive) {
        // Check inactivity for optional auth too
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const lastActivity = user.lastActivity ? new Date(user.lastActivity) : null;
        
        if (!lastActivity || lastActivity >= sevenDaysAgo) {
          const sessionFromToken =
            decoded.branchId != null && String(decoded.branchId).trim() !== ''
              ? String(decoded.branchId).trim()
              : null;
          req.user = {
            ...user,
            id: user._id.toString(),
            branchId: user.branchId,
            sessionBranchId: sessionFromToken,
          };
          // Update last activity (optimized - only updates if > 1 min since last update)
          const now = new Date();
          if (!lastActivity || (now - lastActivity) > 60000) {
            User.updateOne(
              { _id: user._id },
              { $set: { lastActivity: now } }
            ).catch(() => {
              // Silently fail
            });
          }
        }
      }
    } catch (error) {
      // If token is invalid, just continue without user
    }
  }

  next();
});

module.exports = {
  auth,
  authorize,
  optionalAuth
};