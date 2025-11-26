 
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const asyncHandler = require('./asyncHandler');

// Protect routes - authenticate token
const auth = asyncHandler(async (req, res, next) => {
  let token;

  // Check for token in headers
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  // Make sure token exists
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if user still exists (use lean() and select only needed fields for better performance)
    const user = await User.findById(decoded.id).select('isActive lastActivity role email').lean();
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'No user found with this token'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User account has been deactivated'
      });
    }

    // Check if user has been inactive for 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    if (user.lastActivity && new Date(user.lastActivity) < sevenDaysAgo) {
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
        { _id: user._id },
        { $set: { lastActivity: now } }
      ).catch(() => {
        // Silently fail - don't log to avoid spam
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    });
  }
});

// Grant access to specific roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to access this route`
      });
    }
    next();
  };
};

// Optional auth - doesn't require authentication but adds user if token exists
const optionalAuth = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('isActive lastActivity').lean();
      
      if (user && user.isActive) {
        // Check inactivity for optional auth too
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const lastActivity = user.lastActivity ? new Date(user.lastActivity) : null;
        
        if (!lastActivity || lastActivity >= sevenDaysAgo) {
          req.user = user;
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