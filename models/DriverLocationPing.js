const mongoose = require('mongoose');

// Lightweight time-series breadcrumb of driver GPS pings, kept separate from
// Order so a delivery's every-few-seconds tick never write-amplifies the
// Order document that customers/admins are simultaneously reading. This is
// an audit/history trail only — the live map is driven by the Socket.IO
// relay, not by reading this collection.
const driverLocationPingSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true
  },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  heading: Number,
  speed: Number,
  accuracy: Number,
  recordedAt: { type: Date, required: true },
  createdAt: {
    type: Date,
    default: Date.now,
    // TTL: automatically purged after 45 days — this is a breadcrumb trail,
    // not permanent order history (trackingUpdates on Order covers that).
    expires: 60 * 60 * 24 * 45
  }
});

driverLocationPingSchema.index({ orderId: 1, recordedAt: -1 });

module.exports = mongoose.model('DriverLocationPing', driverLocationPingSchema);
