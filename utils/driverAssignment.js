const User = require('../models/User');
const Order = require('../models/Order');

const ACTIVE_DRIVER_STATUSES = ['ready', 'driverpickup', 'pickup', 'out-for-delivery'];

/**
 * Picks the best available driver in a branch for auto-assignment: only
 * drivers who are actually online right now, load-balanced by whichever
 * currently has the fewest active deliveries. Returns null if no driver in
 * the branch is online — callers should leave the order unassigned rather
 * than handing it to someone who isn't working, so admin can assign
 * manually instead.
 */
async function pickAvailableDriver(branchId) {
  const onlineDrivers = await User.find({
    branchId,
    role: 'driver',
    isActive: true,
    'driverStatus.isOnline': true,
    'driverStatus.isAvailable': true
  })
    .select('_id firstName lastName phone driverStatus')
    .lean();

  if (onlineDrivers.length === 0) return null;
  if (onlineDrivers.length === 1) return onlineDrivers[0];

  const driverIds = onlineDrivers.map((d) => d._id);
  const activeCounts = await Order.aggregate([
    { $match: { deliveryAgent: { $in: driverIds }, status: { $in: ACTIVE_DRIVER_STATUSES } } },
    { $group: { _id: '$deliveryAgent', count: { $sum: 1 } } }
  ]);
  const countByDriverId = new Map(activeCounts.map((c) => [c._id.toString(), c.count]));

  onlineDrivers.sort(
    (a, b) => (countByDriverId.get(a._id.toString()) || 0) - (countByDriverId.get(b._id.toString()) || 0)
  );

  return onlineDrivers[0];
}

module.exports = { pickAvailableDriver, ACTIVE_DRIVER_STATUSES };
