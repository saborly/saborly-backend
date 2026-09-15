const { Server } = require('socket.io');
const authSocket = require('./authSocket');
const registerOrderTrackingHandlers = require('./orderTrackingHandlers');

let io = null;

// Attaches Socket.IO to the existing persistent http.Server instance
// (server.js's `server` variable, from app.listen()). Reuses the same
// permissive CORS the REST API already uses — all current clients are
// mobile apps, not browsers with meaningful Origin risk.
function init(server, app) {
  io = new Server(server, {
    cors: { origin: true, credentials: true }
  });

  io.use(authSocket);
  registerOrderTrackingHandlers(io);

  // Exposes io to REST route handlers via req.app.get('io'), so the existing
  // PATCH /:id/status and the new driver/order routes can broadcast
  // order:status_changed etc. from the same code path that already updates Mongo.
  if (app) app.set('io', io);

  return io;
}

function getIO() {
  return io;
}

module.exports = { init, getIO };
