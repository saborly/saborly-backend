const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Offer title is required'],
    trim: true,
    maxlength: [200, 'Title cannot be more than 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Offer description is required'],
    trim: true,
    maxlength: [1000, 'Description cannot be more than 1000 characters']
  },
  subtitle: {
    type: String,
    trim: true,
    maxlength: [100, 'Subtitle cannot be more than 100 characters']
  },
  imageUrl: {
    type: String,
    required: [true, 'Image URL is required']
  },
  bannerColor: {
    type: String,
    default: '#E91E63',
    match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Please provide a valid hex color']
  },
  type: {
    type: String,
    enum: ['percentage', 'fixed-amount', 'buy-one-get-one', 'free-delivery', 'combo'],
    required: true
  },
  value: {
    type: Number,
    required: function() {
      return ['percentage', 'fixed-amount'].includes(this.type);
    },
    min: [0, 'Value cannot be negative']
  },
  couponCode: {
    type: String,
    unique: true,
    sparse: true,
    uppercase: true,
    trim: true,
    match: [/^[A-Z0-9]+$/, 'Coupon code can only contain uppercase letters and numbers']
  },
  minOrderAmount: {
    type: Number,
    default: 0,
    min: [0, 'Minimum order amount cannot be negative']
  },
  maxDiscountAmount: {
    type: Number,
    min: [0, 'Maximum discount amount cannot be negative']
  },
  usageLimit: {
    type: Number,
    default: null
  },
  usageCount: {
    type: Number,
    default: 0
  },
  userUsageLimit: {
    type: Number,
    default: 1
  },
  // NEW: One-time offer per device restriction
  isOneTimePerDevice: {
    type: Boolean,
    default: false
  },
  // Track devices that have claimed this offer
  claimedDevices: [{
    deviceId: {
      type: String,
      required: true
    },
    claimedAt: {
      type: Date,
      default: Date.now
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  appliedToCategories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  }],
  appliedToItems: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FoodItem'
  }],
  excludedItems: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FoodItem'
  }],
  deliveryTypes: [{
    type: String,
    enum: ['delivery', 'pickup']
  }],
  platforms: [{
    type: String,
    enum: ['mobile', 'web', 'all'],
    default: ['all']
  }],
  branches: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch'
  }],
  userTiers: [{
    type: String,
    enum: ['bronze', 'silver', 'gold', 'platinum']
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  comboItems: [{
    foodItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodItem',
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1
    }
  }],
  comboPrice: {
    type: Number,
    required: function() {
      return this.type === 'combo';
    },
    min: [0, 'Combo price cannot be negative']
  },
  startDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  endDate: {
    type: Date,
    required: true,
    validate: {
      validator: function(endDate) {
        return endDate > this.startDate;
      },
      message: 'End date must be after start date'
    }
  },
  priority: {
    type: Number,
    default: 1,
    min: 1,
    max: 10
  },
  termsAndConditions: [{
    type: String,
    trim: true
  }],
  usageHistory: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order'
    },
    deviceId: String,
    discountAmount: Number,
    platform: {
      type: String,
      enum: ['mobile', 'web']
    },
    usedAt: {
      type: Date,
      default: Date.now
    }
  }, { default: [] }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for checking if offer is currently valid
offerSchema.virtual('isValid').get(function() {
  const now = new Date();
  return this.isActive && 
         now >= this.startDate && 
         now <= this.endDate &&
         (this.usageLimit === null || this.usageCount < this.usageLimit);
});

// Virtual for remaining uses
offerSchema.virtual('remainingUses').get(function() {
  if (this.usageLimit === null) return 'Unlimited';
  return Math.max(0, this.usageLimit - this.usageCount);
});

// Virtual for discount display
offerSchema.virtual('discountDisplay').get(function() {
  switch (this.type) {
    case 'percentage':
      return `${this.value}% OFF`;
    case 'fixed-amount':
      return `$${this.value} OFF`;
    case 'buy-one-get-one':
      return 'Buy 1 Get 1 Free';
    case 'free-delivery':
      return 'Free Delivery';
    case 'combo':
      return 'Special Combo Deal';
    default:
      return 'Special Offer';
  }
});

// Indexes
offerSchema.index({ isActive: 1, endDate: 1 });
offerSchema.index({ couponCode: 1 });
offerSchema.index({ startDate: 1, endDate: 1 });
offerSchema.index({ isFeatured: 1, priority: -1 });
offerSchema.index({ type: 1 });
offerSchema.index({ platforms: 1 });
offerSchema.index({ 'claimedDevices.deviceId': 1 }); // NEW: Index for device lookups
offerSchema.index({ isOneTimePerDevice: 1 });

// Method to check if device has already claimed this offer
offerSchema.methods.hasDeviceClaimed = function(deviceId) {
  if (!this.isOneTimePerDevice) return false;
  return this.claimedDevices.some(claim => claim.deviceId === deviceId);
};

// Method to mark device as claimed
offerSchema.methods.claimByDevice = function(deviceId, userId = null) {
  if (!this.isOneTimePerDevice) return this;
  
  // Check if already claimed
  if (this.hasDeviceClaimed(deviceId)) {
    throw new Error('This device has already claimed this offer');
  }
  
  this.claimedDevices.push({
    deviceId,
    userId,
    claimedAt: new Date()
  });
  
  return this.save();
};

// Method to check if offer is valid for platform
offerSchema.methods.isValidForPlatform = function(platform) {
  if (!platform) return true;
  if (!this.platforms || this.platforms.length === 0) return true;
  return this.platforms.includes('all') || this.platforms.includes(platform);
};

// Method to check if user can use this offer
offerSchema.methods.canUserUse = function(userId, deviceId = null) {
  if (!this.isValid) return false;
  
  // Check device restriction
  if (this.isOneTimePerDevice && deviceId && this.hasDeviceClaimed(deviceId)) {
    return false;
  }
  
  const usageHistory = Array.isArray(this.usageHistory) ? this.usageHistory : [];
  
  const userUsage = usageHistory.filter(usage => 
    usage.user.toString() === userId.toString()
  ).length;
  
  return userUsage < this.userUsageLimit;
};

// Method to calculate discount for an order
offerSchema.methods.calculateDiscount = function(orderDetails) {
  const { subtotal, items, deliveryType } = orderDetails;
  
  if (subtotal < this.minOrderAmount) {
    return { valid: false, reason: `Minimum order amount is $${this.minOrderAmount}` };
  }
  
  if (this.deliveryTypes.length > 0 && !this.deliveryTypes.includes(deliveryType)) {
    return { valid: false, reason: 'Offer not valid for this delivery type' };
  }
  
  let discount = 0;
  
  switch (this.type) {
    case 'percentage':
      discount = (subtotal * this.value) / 100;
      if (this.maxDiscountAmount && discount > this.maxDiscountAmount) {
        discount = this.maxDiscountAmount;
      }
      break;
      
    case 'fixed-amount':
      discount = Math.min(this.value, subtotal);
      break;
      
    case 'free-delivery':
      discount = 2.99;
      break;
      
    case 'buy-one-get-one':
      if (this.appliedToItems.length > 0) {
        const eligibleItems = items.filter(item => 
          this.appliedToItems.some(offerId => 
            offerId.toString() === item.foodItem.toString()
          )
        );
        
        eligibleItems.forEach(item => {
          const freeQuantity = Math.floor(item.quantity / 2);
          discount += freeQuantity * item.unitPrice;
        });
      }
      break;
  }
  
  return {
    valid: true,
    discount: Math.round(discount * 100) / 100
  };
};

// Method to apply offer to user with platform and device tracking
offerSchema.methods.applyToUser = async function(userId, orderId, discountAmount, platform, deviceId = null) {
  this.usageHistory.push({
    user: userId,
    order: orderId,
    deviceId,
    discountAmount,
    platform: platform || 'web',
    usedAt: new Date()
  });
  
  this.usageCount += 1;
  
  // Mark device as claimed if one-time offer
  if (this.isOneTimePerDevice && deviceId && !this.hasDeviceClaimed(deviceId)) {
    this.claimedDevices.push({
      deviceId,
      userId,
      claimedAt: new Date()
    });
  }
  
  return this.save();
};

// Static method to find valid offers for user with platform and device filter
offerSchema.statics.findValidOffersForUser = function(userId, orderDetails, platform, deviceId = null) {
  const now = new Date();
  
  let query = {
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
    $or: [
      { usageLimit: null },
      { $expr: { $lt: ['$usageCount', '$usageLimit'] } }
    ]
  };

  // Add platform filter
  if (platform && platform !== 'all') {
    query.$and = [
      {
        $or: [
          { platforms: { $in: ['all'] } },
          { platforms: { $in: [platform] } },
          { platforms: { $exists: false } },
          { platforms: { $size: 0 } }
        ]
      }
    ];
  }
  
  return this.find(query)
    .populate('appliedToCategories appliedToItems excludedItems')
    .sort({ priority: -1, createdAt: -1 })
    .then(offers => {
      // Filter out offers where device has already claimed (if one-time per device)
      if (deviceId) {
        return offers.filter(offer => {
          if (offer.isOneTimePerDevice) {
            return !offer.hasDeviceClaimed(deviceId);
          }
          return true;
        });
      }
      return offers;
    });
};

// Static method to find offer by coupon code with device check
offerSchema.statics.findByCouponCode = function(code, platform, deviceId = null) {
  let query = {
    couponCode: code.toUpperCase(),
    isActive: true,
    startDate: { $lte: new Date() },
    endDate: { $gte: new Date() }
  };

  // Add platform filter
  if (platform && platform !== 'all') {
    query.$or = [
      { platforms: { $in: ['all'] } },
      { platforms: { $in: [platform] } },
      { platforms: { $exists: false } },
      { platforms: { $size: 0 } }
    ];
  }

  return this.findOne(query).then(offer => {
    if (!offer) return null;
    
    // Check device restriction
    if (offer.isOneTimePerDevice && deviceId && offer.hasDeviceClaimed(deviceId)) {
      throw new Error('This device has already claimed this offer');
    }
    
    return offer;
  });
};

module.exports = mongoose.model('Offer', offerSchema);