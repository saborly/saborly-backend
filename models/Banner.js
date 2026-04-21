// models/Banner.js
const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true,
    index: true,
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  imageUrl: {
    type: String,
    required: true,
    trim: true
  },
  order: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  link: {
    type: String,
    trim: true,
    default: null
  },
  description: {
    type: String,
    trim: true
  },
  startDate: {
    type: Date,
    default: null
  },
  endDate: {
    type: Date,
    default: null
  },
  category: {
    type: String,
    enum: ['promotional', 'seasonal', 'featured', 'general'],
    default: 'general'
  }
}, {
  timestamps: true
});

// Index for efficient querying
bannerSchema.index({ branchId: 1, isActive: 1, order: 1 });

// Virtual to check if banner is currently valid
bannerSchema.virtual('isValid').get(function() {
  const now = new Date();
  if (!this.isActive) return false;
  if (this.startDate && now < this.startDate) return false;
  if (this.endDate && now > this.endDate) return false;
  return true;
});

// Method to get active banners for a branch
bannerSchema.statics.getActiveBanners = async function(branchId, category = null) {
  const now = new Date();
  const query = {
    branchId,
    isActive: true,
    $and: [
      { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
      { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
    ],
  };

  if (category) {
    query.category = category;
  }

  return this.find(query).sort({ order: 1, createdAt: -1 });
};

module.exports = mongoose.model('Banner', bannerSchema);