const Order = require('../models/Order');
const User = require('../models/User');
const DriverLocationPing = require('../models/DriverLocationPing');
const { getTrackingStage } = require('../utils/trackingStageMap');
const { ACTIVE_DRIVER_STATUSES } = require('../utils/driverAssignment');

const STAFF_ROLES = ['admin', 'manager', 'branch_admin', 'staff', 'super_admin', 'superadmin'];
const CROSS_BRANCH_ROLES = ['super_admin', 'superadmin'];

// Server-enforced GPS write policy: an active delivery can emit a location
// tick every 3-5s over the socket, but every tick does NOT hit MongoDB — the
// live relay to clients is purely in-memory room broadcast. Persistence
// (Order.deliveryTracking snapshot, User.driverStatus snapshot, and the
// DriverLocationPing history row) only happens once per ~12s OR ~50m moved,
// whichever comes first, turning "1 write/sec/driver" into roughly
// "1 write/10-15s/driver" so many concurrent deliveries don't hammer Mongo.
const PING_PERSIST_INTERVAL_MS = 12000;
const PING_PERSIST_DISTANCE_M = 50;
const BRANCH_BROADCAST_INTERVAL_MS = 2000;

// In-memory throttle/debounce state. Correct as-is for the current single
// persistent Node instance; a future multi-instance deployment would need
// this state moved to Redis alongside a @socket.io/redis-adapter (documented
// in the plan as a not-built-now future consideration).
const lastPersisted = new Map(); // orderId -> { at, lat, lng }
const branchBroadcastTimers = new Map(); // branchId -> Timeout

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const p = Math.PI / 180;
  const a =
    0.5 - Math.cos((lat2 - lat1) * p) / 2 +
    (Math.cos(lat1 * p) * Math.cos(lat2 * p) * (1 - Math.cos((lon2 - lon1) * p))) / 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function shouldPersist(orderId, lat, lng) {
  const prev = lastPersisted.get(orderId);
  if (!prev) return true;
  if (Date.now() - prev.at >= PING_PERSIST_INTERVAL_MS) return true;
  return haversineMeters(prev.lat, prev.lng, lat, lng) >= PING_PERSIST_DISTANCE_M;
}

function scheduleBranchBroadcast(io, branchId) {
  if (!branchId || branchBroadcastTimers.has(branchId)) return;

  const timer = setTimeout(async () => {
    branchBroadcastTimers.delete(branchId);
    try {
      // Same populated shape as GET /drivers/active-deliveries — the client
      // replaces its whole list with whichever of the two arrives, so both
      // sources must carry the same fields (customer/driver objects, not
      // just a raw driverId) or cards lose their display data on the first
      // live update.
      const orders = await Order.find({
        branchId,
        deliveryAgent: { $ne: null },
        status: { $in: ACTIVE_DRIVER_STATUSES }
      })
        .populate([
          { path: 'userId', select: 'firstName lastName phone' },
          { path: 'deliveryAgent', select: 'firstName lastName phone driverStatus' }
        ])
        .select('orderNumber status deliveryAddress deliveryTracking userId deliveryAgent')
        .lean();

      io.to(`branch:${branchId}:dashboard`).emit('branch:active_deliveries_update', {
        branchId,
        orders: orders.map((o) => ({
          id: o._id,
          orderNumber: o.orderNumber,
          status: o.status,
          trackingStage: getTrackingStage(o.status),
          deliveryAddress: o.deliveryAddress || null,
          customer: o.userId
            ? { firstName: o.userId.firstName, lastName: o.userId.lastName, phone: o.userId.phone }
            : null,
          driver: o.deliveryAgent
            ? {
                id: o.deliveryAgent._id,
                firstName: o.deliveryAgent.firstName,
                lastName: o.deliveryAgent.lastName,
                phone: o.deliveryAgent.phone,
                vehicleType: o.deliveryAgent.driverStatus?.vehicleType || null
              }
            : null,
          deliveryTracking: o.deliveryTracking || null
        }))
      });
    } catch (error) {
      console.error('branch:active_deliveries_update broadcast error:', error.message);
    }
  }, BRANCH_BROADCAST_INTERVAL_MS);

  branchBroadcastTimers.set(branchId, timer);
}

module.exports = function registerOrderTrackingHandlers(io) {
  io.on('connection', (socket) => {
    const user = socket.user;

    // Rooms are never auto-joined on connect — every join is authorized
    // against the requesting user first (owner / assigned driver / branch
    // staff), same authorization philosophy as the existing REST routes.
    socket.on('join_order_tracking', async (payload = {}) => {
      const { orderId } = payload;
      if (!orderId) return;

      try {
        const order = await Order.findById(orderId).select('userId deliveryAgent branchId');
        if (!order) return;

        const isOwner = order.userId && order.userId.toString() === user.id;
        const isAssignedDriver = order.deliveryAgent && order.deliveryAgent.toString() === user.id;
        const isBranchStaff =
          STAFF_ROLES.includes(user.role) &&
          (CROSS_BRANCH_ROLES.includes(user.role) || order.branchId?.toString() === user.branchId);

        if (!isOwner && !isAssignedDriver && !isBranchStaff) {
          socket.emit('order:tracking_error', { orderId, message: 'Not authorized to track this order' });
          return;
        }

        socket.join(`order:${orderId}`);
        if (isAssignedDriver) socket.join(`driver:${user.id}`);
      } catch (error) {
        // Bad/unknown orderId — silently no-op the join.
      }
    });

    socket.on('leave_order_tracking', (payload = {}) => {
      if (payload.orderId) socket.leave(`order:${payload.orderId}`);
    });

    socket.on('join_branch_dashboard', (payload = {}) => {
      const { branchId } = payload;
      if (!branchId || !STAFF_ROLES.includes(user.role)) return;
      if (!CROSS_BRANCH_ROLES.includes(user.role) && user.branchId !== branchId) return;
      socket.join(`branch:${branchId}:dashboard`);
    });

    socket.on('driver:start_delivery', async (payload = {}) => {
      const { orderId } = payload;
      if (user.role !== 'driver' || !orderId) return;

      try {
        const order = await Order.findOne({ _id: orderId, deliveryAgent: user.id });
        if (!order) return;

        order.deliveryTracking = order.deliveryTracking || {};
        order.deliveryTracking.isLive = true;
        order.deliveryTracking.startedAt = new Date();
        order.deliveryTracking.endedAt = null;
        order.markModified('deliveryTracking');
        await order.save();

        await User.updateOne(
          { _id: user.id },
          { $set: { 'driverStatus.isOnline': true, 'driverStatus.lastSeenAt': new Date() } }
        );

        io.to(`order:${orderId}`).emit('order:driver_started', { orderId });
      } catch (error) {
        console.error('driver:start_delivery error:', error.message);
      }
    });

    socket.on('driver:end_delivery', async (payload = {}) => {
      const { orderId, reason } = payload;
      if (user.role !== 'driver' || !orderId) return;

      try {
        const order = await Order.findOne({ _id: orderId, deliveryAgent: user.id });
        if (!order) return;

        order.deliveryTracking = order.deliveryTracking || {};
        order.deliveryTracking.isLive = false;
        order.deliveryTracking.endedAt = new Date();
        order.markModified('deliveryTracking');
        await order.save();

        lastPersisted.delete(orderId);
        io.to(`order:${orderId}`).emit('order:driver_ended', { orderId, reason: reason || 'manual' });
      } catch (error) {
        console.error('driver:end_delivery error:', error.message);
      }
    });

    socket.on('driver:location_update', async (payload = {}) => {
      if (user.role !== 'driver') return;

      const { orderId, latitude, longitude, heading, speed, accuracy, timestamp } = payload;
      if (!orderId || typeof latitude !== 'number' || typeof longitude !== 'number') return;

      // Hot path first: relay immediately, zero DB round-trip in the critical path.
      io.to(`order:${orderId}`).emit('order:location_update', {
        orderId,
        driverId: user.id,
        latitude,
        longitude,
        heading: heading ?? null,
        speed: speed ?? null,
        timestamp: timestamp || new Date().toISOString()
      });

      if (!shouldPersist(orderId, latitude, longitude)) return;
      lastPersisted.set(orderId, { at: Date.now(), lat: latitude, lng: longitude });

      try {
        const order = await Order.findOne({ _id: orderId, deliveryAgent: user.id }).select('branchId deliveryTracking');
        if (!order) return;

        const now = new Date();
        order.deliveryTracking = order.deliveryTracking || {};
        order.deliveryTracking.currentLocation = { latitude, longitude, heading, speed, updatedAt: now };
        order.deliveryTracking.lastPingAt = now;
        order.markModified('deliveryTracking');

        await Promise.all([
          order.save(),
          User.updateOne(
            { _id: user.id },
            {
              $set: {
                'driverStatus.currentLocation': { latitude, longitude, heading, speed, updatedAt: now },
                'driverStatus.lastSeenAt': now
              }
            }
          ),
          DriverLocationPing.create({
            orderId,
            driverId: user.id,
            branchId: order.branchId,
            latitude,
            longitude,
            heading,
            speed,
            accuracy,
            recordedAt: timestamp ? new Date(timestamp) : now
          })
        ]);

        scheduleBranchBroadcast(io, order.branchId ? order.branchId.toString() : null);
      } catch (error) {
        console.error('driver:location_update persist error:', error.message);
      }
    });

    // A bare disconnect (mobile network blip) must NEVER flip a delivery's
    // isLive state off — only the staleness timeout (computed on read, see
    // GET /:id/tracking) or an explicit driver:end_delivery does that.
    socket.on('disconnect', () => {});
  });
};
