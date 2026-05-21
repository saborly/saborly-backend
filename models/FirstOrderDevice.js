const mongoose = require('mongoose');

// Tracks which devices have already used the first-order mobile discount.
// One record per (deviceId + branchId) pair prevents the same device from
// claiming the discount again even after creating a new account.
const firstOrderDeviceSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: true,
    trim: true
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  discountAmount: {
    type: Number,
    required: true
  },
  usedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Unique: one device can only use the first-order discount once per branch
firstOrderDeviceSchema.index({ deviceId: 1, branchId: 1 }, { unique: true });

module.exports = mongoose.model('FirstOrderDevice', firstOrderDeviceSchema);
