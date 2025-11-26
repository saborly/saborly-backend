const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const Offer = require('../models/offer');
const { FoodItem } = require('../models/Category');
const { auth, authorize, optionalAuth } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const mongoose = require('mongoose');

const router = express.Router();

// @desc    Get all active offers with platform and device filter
// @route   GET /api/v1/offers
// @access  Public
router.get('/', [
  query('featured').optional().isBoolean().withMessage('Featured must be boolean'),
  query('type').optional().isIn(['percentage', 'fixed-amount', 'buy-one-get-one', 'free-delivery', 'combo']).withMessage('Invalid offer type'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('deviceId').optional().isString().withMessage('Device ID must be a string'),
  query('platform').optional().isIn(['mobile', 'web', 'all']).withMessage('Platform must be mobile, web, or all')
], optionalAuth, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const {
    featured,
    type,
    platform,
    deviceId,
    page = 1,
    limit = 20
  } = req.query;

  const skip = (page - 1) * limit;

  let query = {
    isActive: true,
    startDate: { $lte: new Date() },
    endDate: { $gte: new Date() }
  };

  if (featured !== undefined) query.isFeatured = featured === 'true';
  if (type) query.type = type;

  // Add platform filter
  if (platform && platform !== 'all') {
    query.$or = [
      { platforms: { $in: ['all'] } },
      { platforms: { $in: [platform] } },
      { platforms: { $exists: false } },
      { platforms: { $size: 0 } }
    ];
  }

  const offers = await Offer.find(query)
    .populate({
      path: 'appliedToItems',
      select: 'name imageUrl price originalPrice category isActive',
      populate: {
        path: 'category',
        select: 'name icon'
      }
    })
    .populate('appliedToCategories', 'name icon')
    .populate({
      path: 'comboItems.foodItem',
      select: 'name imageUrl price category'
    })
    .sort({ priority: -1, isFeatured: -1, createdAt: -1 })
    .limit(parseInt(limit))
    .skip(skip)
    .select('-usageHistory')
    .lean(); // Use lean() for better performance

  // Filter out offers already claimed by this device (if deviceId provided)
  let filteredOffers = offers;
  if (deviceId) {
    filteredOffers = offers.filter(offer => {
      if (offer.isOneTimePerDevice) {
        return !offer.hasDeviceClaimed(deviceId);
      }
      return true;
    });
  }

  // Calculate discounted prices for items
  const offersWithPrices = filteredOffers.map(offer => {
    const offerObj = offer.toObject();
    
    // Add device claim status
    offerObj.isClaimedByDevice = deviceId && offer.isOneTimePerDevice ? offer.hasDeviceClaimed(deviceId) : false;
    offerObj.canClaim = !offerObj.isClaimedByDevice && offer.isValid;
    
    // Add discount display for frontend
    offerObj.discountDisplay = getDiscountDisplay(offer);
    
    if (offerObj.appliedToItems && offerObj.appliedToItems.length > 0) {
      offerObj.appliedToItems = offerObj.appliedToItems.map(item => {
        const discountedPrice = calculateItemDiscount(item.price, offer);
        return {
          ...item,
          discountedPrice,
          savings: item.price - discountedPrice
        };
      });
    }

    return offerObj;
  });

  const totalOffers = await Offer.countDocuments(query);
  const totalPages = Math.ceil(totalOffers / limit);

  res.json({
    success: true,
    count: offersWithPrices.length,
    totalOffers,
    totalPages,
    currentPage: parseInt(page),
    platform: platform || 'all',
    deviceId: deviceId || null,
    offers: offersWithPrices
  });
}));

// @desc    Check if device can claim an offer
// @route   GET /api/v1/offers/:id/can-claim
// @access  Public
router.get('/:id/can-claim', [
  param('id').isMongoId().withMessage('Invalid offer ID'),
  query('deviceId').notEmpty().withMessage('Device ID is required')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { deviceId } = req.query;
  const offer = await Offer.findById(req.params.id);

  if (!offer) {
    return res.status(404).json({
      success: false,
      message: 'Offer not found'
    });
  }

  const canClaim = !offer.isOneTimePerDevice || !offer.hasDeviceClaimed(deviceId);
  const isAlreadyClaimed = offer.isOneTimePerDevice && offer.hasDeviceClaimed(deviceId);

  res.json({
    success: true,
    canClaim,
    isAlreadyClaimed,
    isOneTimePerDevice: offer.isOneTimePerDevice,
    offerDetails: {
      id: offer._id,
      title: offer.title,
      type: offer.type,
      isActive: offer.isActive,
      isValid: offer.isValid
    }
  });
}));

// @desc    Claim a one-time offer (mark device as claimed)
// @route   POST /api/v1/offers/:id/claim
// @access  Private
router.post('/:id/claim', [
  auth,
  param('id').isMongoId().withMessage('Invalid offer ID'),
  body('deviceId').notEmpty().withMessage('Device ID is required')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { deviceId } = req.body;
  const offer = await Offer.findById(req.params.id);

  if (!offer) {
    return res.status(404).json({
      success: false,
      message: 'Offer not found'
    });
  }

  if (!offer.isValid) {
    return res.status(400).json({
      success: false,
      message: 'Offer is not valid or has expired'
    });
  }

  if (!offer.isOneTimePerDevice) {
    return res.status(400).json({
      success: false,
      message: 'This offer is not a one-time per device offer'
    });
  }

  if (offer.hasDeviceClaimed(deviceId)) {
    return res.status(400).json({
      success: false,
      message: 'This device has already claimed this offer'
    });
  }

  // Mark device as claimed
  await offer.claimByDevice(deviceId, req.user.id);

  res.json({
    success: true,
    message: 'Offer claimed successfully',
    offer: {
      id: offer._id,
      title: offer.title,
      claimedAt: new Date()
    }
  });
}));

// @desc    Get food items with active offers (platform and device specific)
// @route   GET /api/v1/offers/items-with-offers
// @access  Public
router.get('/items-with-offers', [
  query('platform').optional().isIn(['mobile', 'web', 'all']).withMessage('Platform must be mobile, web, or all'),
  query('deviceId').optional().isString().withMessage('Device ID must be a string'),
  query('includeUnavailable').optional().isBoolean().withMessage('Include unavailable must be boolean')
], asyncHandler(async (req, res) => {
  const { platform, deviceId, includeUnavailable } = req.query;
  const now = new Date();

  let offerQuery = {
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
    appliedToItems: { $exists: true, $ne: [] }
  };

  // Add platform filter
  if (platform && platform !== 'all') {
    offerQuery.$or = [
      { platforms: { $in: ['all'] } },
      { platforms: { $in: [platform] } },
      { platforms: { $exists: false } },
      { platforms: { $size: 0 } }
    ];
  }

  const activeOffers = await Offer.find(offerQuery).populate('appliedToItems');

  // Filter out offers claimed by this device (if one-time per device)
  const availableOffers = deviceId 
    ? activeOffers.filter(offer => !offer.isOneTimePerDevice || !offer.hasDeviceClaimed(deviceId))
    : activeOffers;

  const itemIds = new Set();
  availableOffers.forEach(offer => {
    offer.appliedToItems.forEach(item => {
      if (item._id) itemIds.add(item._id.toString());
    });
  });

  let itemQuery = {
    _id: { $in: Array.from(itemIds) }
  };
  
  if (includeUnavailable !== 'true') {
    itemQuery.isActive = true;
  }

  const items = await FoodItem.find(itemQuery).populate('category', 'name icon');

  const itemsWithOffers = items.map(item => {
    const itemOffers = availableOffers.filter(offer =>
      offer.appliedToItems.some(oi => oi._id.toString() === item._id.toString())
    );

    let bestOffer = null;
    let bestDiscountedPrice = item.price;
    let bestSavings = 0;

    itemOffers.forEach(offer => {
      const discountedPrice = calculateItemDiscount(item.price, offer);
      const savings = item.price - discountedPrice;
      
      if (savings > bestSavings) {
        bestOffer = {
          id: offer._id,
          title: offer.title,
          type: offer.type,
          value: offer.value,
          badge: getDiscountDisplay(offer),
          platforms: offer.platforms,
          isOneTimePerDevice: offer.isOneTimePerDevice,
          isClaimedByDevice: deviceId && offer.isOneTimePerDevice ? offer.hasDeviceClaimed(deviceId) : false
        };
        bestDiscountedPrice = discountedPrice;
        bestSavings = savings;
      }
    });

    return {
      ...item.toObject(),
      offer: bestOffer,
      discountedPrice: bestDiscountedPrice,
      savings: bestSavings,
      discountPercentage: bestSavings > 0 ? Math.round((bestSavings / item.price) * 100) : 0
    };
  });

  res.json({
    success: true,
    count: itemsWithOffers.length,
    platform: platform || 'all',
    deviceId: deviceId || null,
    includeUnavailable: includeUnavailable === 'true',
    items: itemsWithOffers
  });
}));

// Helper function to generate discount display text
function getDiscountDisplay(offer) {
  switch (offer.type) {
    case 'percentage':
      return `${offer.value}% OFF`;
    case 'fixed-amount':
      return `$${offer.value} OFF`;
    case 'buy-one-get-one':
      return 'BOGO';
    case 'free-delivery':
      return 'FREE DELIVERY';
    case 'combo':
      return 'COMBO DEAL';
    default:
      return 'OFFER';
  }
}

// Helper function to calculate item discount
function calculateItemDiscount(originalPrice, offer) {
  if (!offer.isValid) return originalPrice;
  
  let discountedPrice = originalPrice;
  
  switch (offer.type) {
    case 'percentage':
      discountedPrice = originalPrice * (1 - offer.value / 100);
      if (offer.maxDiscountAmount) {
        const maxDiscount = originalPrice - offer.maxDiscountAmount;
        discountedPrice = Math.max(discountedPrice, maxDiscount);
      }
      break;
      
    case 'fixed-amount':
      discountedPrice = Math.max(0, originalPrice - offer.value);
      break;
      
    case 'buy-one-get-one':
      discountedPrice = originalPrice / 2;
      break;
  }
  
  return Math.round(discountedPrice * 100) / 100;
}
router.get('/device-claims', [
  query('deviceId').notEmpty().withMessage('Device ID is required')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { deviceId } = req.query;

  try {
    // Find all offers where this device has claimed
    const offers = await Offer.find({
      'claimedDevices.deviceId': deviceId
    }).select('_id title type claimedDevices');

    // Extract claim info for this device
    const claimedOffers = offers.map(offer => {
      const deviceClaim = offer.claimedDevices.find(
        claim => claim.deviceId === deviceId
      );

      return {
        offerId: offer._id,
        offerTitle: offer.title,
        offerType: offer.type,
        claimedAt: deviceClaim?.claimedAt,
        userId: deviceClaim?.userId
      };
    });

    res.json({
      success: true,
      count: claimedOffers.length,
      deviceId,
      claimedOffers
    });
  } catch (error) {
    console.error('Error fetching device claims:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch device claims',
      error: error.message
    });
  }
}));

// @desc    Claim offer and record usage in order
// @route   POST /api/v1/offer/:id/claim-with-order
// @access  Private
router.post('/:id/claim-with-order', [
  auth,
  param('id').isMongoId().withMessage('Invalid offer ID'),
  body('deviceId').notEmpty().withMessage('Device ID is required'),
  body('orderId').isMongoId().withMessage('Invalid order ID')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { deviceId, orderId } = req.body;
  const offer = await Offer.findById(req.params.id);

  if (!offer) {
    return res.status(404).json({
      success: false,
      message: 'Offer not found'
    });
  }

  if (!offer.isOneTimePerDevice) {
    return res.status(400).json({
      success: false,
      message: 'This offer is not a one-time per device offer'
    });
  }

  if (offer.hasDeviceClaimed(deviceId)) {
    return res.status(400).json({
      success: false,
      message: 'This device has already claimed this offer'
    });
  }

  try {
    // Mark device as claimed
    await offer.claimByDevice(deviceId, req.user.id);

    // Add to usage history
    offer.usageHistory.push({
      user: req.user.id,
      order: orderId,
      deviceId,
      discountAmount: 0, // Will be calculated from order
      platform: req.body.platform || 'mobile',
      usedAt: new Date()
    });

    await offer.save();

    res.json({
      success: true,
      message: 'Offer claimed successfully',
      offer: {
        id: offer._id,
        title: offer.title,
        claimedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Error claiming offer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to claim offer',
      error: error.message
    });
  }
}));

// @desc    Create offer with device restriction support
// @route   POST /api/v1/offers
// @access  Private (Admin only)
router.post('/', [
  auth,
  authorize('admin'),
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('imageUrl').optional().isURL().withMessage('Valid image URL required'),
  body('type').isIn(['percentage', 'fixed-amount', 'buy-one-get-one', 'free-delivery', 'combo']).withMessage('Invalid offer type'),
  body('startDate').isISO8601().withMessage('Valid start date is required'),
  body('endDate').isISO8601().withMessage('Valid end date is required'),
  body('value').optional().isFloat({ min: 0 }).withMessage('Value must be non-negative'),
  body('platforms').optional().isArray().withMessage('Platforms must be an array'),
  body('platforms.*').optional().isIn(['mobile', 'web', 'all']).withMessage('Invalid platform value'),
  body('isOneTimePerDevice').optional().isBoolean().withMessage('isOneTimePerDevice must be boolean'),
  body('appliedToItems').optional().isArray().withMessage('Applied items must be an array'),
  body('appliedToItems.*').optional().isMongoId().withMessage('Invalid item ID')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  // Set default platform if not provided
  if (!req.body.platforms || req.body.platforms.length === 0) {
    req.body.platforms = ['all'];
  }

  // Verify items exist if provided
  if (req.body.appliedToItems && req.body.appliedToItems.length > 0) {
    const items = await FoodItem.find({
      _id: { $in: req.body.appliedToItems },
      isActive: true
    });

    if (items.length !== req.body.appliedToItems.length) {
      return res.status(400).json({
        success: false,
        message: 'Some items not found or inactive'
      });
    }
  }

  const offer = await Offer.create(req.body);
  
  await offer.populate({
    path: 'appliedToItems',
    select: 'name imageUrl price category',
    populate: { path: 'category', select: 'name icon' }
  });

  res.status(201).json({
    success: true,
    message: 'Offer created successfully',
    offer
  });
}));

// @desc    Update offer
// @route   PUT /api/v1/offers/:id
// @access  Private (Admin only)
router.put('/:id', [
  auth,
  authorize('admin'),
  param('id').isMongoId().withMessage('Invalid offer ID'),
  body('isOneTimePerDevice').optional().isBoolean().withMessage('isOneTimePerDevice must be boolean')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const offer = await Offer.findById(req.params.id);
  if (!offer) {
    return res.status(404).json({
      success: false,
      message: 'Offer not found'
    });
  }

  // Verify items exist if provided
  if (req.body.appliedToItems && req.body.appliedToItems.length > 0) {
    const items = await FoodItem.find({
      _id: { $in: req.body.appliedToItems },
      isActive: true
    });

    if (items.length !== req.body.appliedToItems.length) {
      return res.status(400).json({
        success: false,
        message: 'Some items not found or inactive'
      });
    }
  }

  Object.keys(req.body).forEach(key => {
    offer[key] = req.body[key];
  });

  await offer.save();

  await offer.populate([
    {
      path: 'appliedToItems',
      select: 'name imageUrl price category',
      populate: { path: 'category', select: 'name icon' }
    },
    {
      path: 'comboItems.foodItem',
      select: 'name imageUrl price category'
    }
  ]);

  res.json({
    success: true,
    message: 'Offer updated successfully',
    offer
  });
}));

// @desc    Get single offer by ID
// @route   GET /api/v1/offers/:id
// @access  Public
router.get('/:id', [
  param('id').isMongoId().withMessage('Invalid offer ID'),
  query('deviceId').optional().isString().withMessage('Device ID must be a string')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { deviceId } = req.query;

  const offer = await Offer.findById(req.params.id)
    .populate({
      path: 'appliedToItems',
      select: 'name imageUrl price originalPrice category isActive',
      populate: {
        path: 'category',
        select: 'name icon'
      }
    })
    .populate('appliedToCategories', 'name icon')
    .populate({
      path: 'comboItems.foodItem',
      select: 'name imageUrl price category'
    });

  if (!offer) {
    return res.status(404).json({
      success: false,
      message: 'Offer not found'
    });
  }

  const offerObj = offer.toObject();
  
  // Add device claim status if deviceId provided
  if (deviceId) {
    offerObj.isClaimedByDevice = offer.isOneTimePerDevice ? offer.hasDeviceClaimed(deviceId) : false;
    offerObj.canClaim = !offerObj.isClaimedByDevice && offer.isValid;
  }

  res.json({
    success: true,
    offer: offerObj
  });
}));

// @desc    Delete offer
// @route   DELETE /api/v1/offers/:id
// @access  Private (Admin only)
router.delete('/:id', [
  auth,
  authorize('admin'),
  param('id').isMongoId().withMessage('Invalid offer ID')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const offer = await Offer.findById(req.params.id);
  if (!offer) {
    return res.status(404).json({
      success: false,
      message: 'Offer not found'
    });
  }

  await offer.deleteOne();

  res.json({
    success: true,
    message: 'Offer deleted successfully'
  });
}));

module.exports = router;