const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Mirrors middleware/auth.js's JWT verification exactly, adapted for the
// Socket.IO handshake (token passed in `auth`, never a query string).
module.exports = async function authSocket(socket, next) {
  try {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) {
      return next(new Error('unauthorized'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId || decoded.id;

    const user = await User.findById(userId)
      .select('isActive role branchId firstName lastName')
      .lean();

    if (!user || !user.isActive) {
      return next(new Error('unauthorized'));
    }

    socket.user = {
      id: userId.toString(),
      role: user.role,
      branchId: user.branchId ? user.branchId.toString() : null,
      firstName: user.firstName || '',
      lastName: user.lastName || ''
    };

    next();
  } catch (error) {
    next(new Error('unauthorized'));
  }
};
