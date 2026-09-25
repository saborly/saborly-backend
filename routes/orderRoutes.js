const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const Order = require('../models/Order');
const FirstOrderDevice = require('../models/FirstOrderDevice');

const { FoodItem } = require('../models/Category');
const User = require('../models/User');

const { auth, authorize } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const Branch = require('../models/Branch');
const { attachBranchToRequest, resolveBranchContext } = require('../middleware/branchContext');
const router = express.Router();
const {
  sendOrderStatusNotification,
  sendNewOrderNotification,
  sendDeliveryAssignmentNotification,
  sendDeliveryCompletedNotification,
} = require('../utils/notificationService');
const {
  sendNotificationToDevice,
} = require("../utils/firebaseAdmin");
const { sendNotificationToTopic } = require('../utils/firebaseAdmin');
const { validateCoordinates, calculateDistance } = require('../utils/locationUtils');
const { normalizePhone, isValidPhone } = require('../utils/phoneUtils');
const { getTrackingStage, getTrackingStageLabel } = require('../utils/trackingStageMap');
const { pickAvailableDriver } = require('../utils/driverAssignment');

const STAFF_ROLES = ['admin', 'manager', 'branch_admin', 'staff', 'super_admin', 'superadmin'];

// Same 3.5km delivery radius enforced when saving an address
// (controllers/Addresscontroller.js) — re-checked here because a client
// could otherwise send an arbitrary deliveryAddress directly in the order
// payload without ever going through the saved-address flow.
const MAX_DELIVERY_DISTANCE = 3.5; // km

// Mirrors Addresscontroller.js's getShopCoords: uses the resolved branch's
// coordinates, falling back to the Barcelona main branch if unset.
function getShopCoords(req) {
  const doc = req.branchDoc;
  if (doc && doc.latitude != null && doc.longitude != null) {
    return { lat: doc.latitude, lng: doc.longitude };
  }
  return { lat: 41.4036344, lng: 2.1986439 };
}

const normalizeStringValue = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    return value.value || value.id || value.key || value.code || value.name || value.type || '';
  }
  return String(value).trim();
};

const normalizePaymentMethod = (value) => {
  const raw = normalizeStringValue(value);
  const lower = (raw || '').toLowerCase().replace(/[\s_]/g, '-');

  if (['cashondelivery', 'cash-on-delivery', 'cash-ondelivery', 'cod'].includes(lower)) return 'cashOnDelivery';
  if (lower === 'cashondelivery') return 'cashOnDelivery';
  if (lower === 'shop' || lower === 'pay-at-shop') return 'shop';
  if (['card', 'paypal', 'stripe'].includes(lower)) return lower;

  return raw;
};

const normalizeDeliveryType = (value) => {
  const raw = normalizeStringValue(value);
  const lower = (raw || '').toLowerCase();
  if (lower === 'takeaway') return 'pickup';
  return raw;
};

const normalizeCodPaymentType = (value) => {
  const raw = normalizeStringValue(value);
  const lower = (raw || '').toLowerCase();
  if (lower === 'cash' || lower === 'card') return lower;
  return raw;
};

const normalizeOrderItems = (items) => {
  if (!Array.isArray(items)) return items;

  return items.map((item) => {
    if (!item || typeof item !== 'object') return item;

    const normalizedItem = { ...item };
    const foodItem = item.foodItem;

    if (foodItem && typeof foodItem === 'object') {
      const foodItemId = foodItem.id || foodItem._id || foodItem.value;
      if (foodItemId) {
        normalizedItem.foodItem = { ...foodItem, id: foodItemId };
      }
    } else if (foodItem && typeof foodItem === 'string') {
      normalizedItem.foodItem = { id: foodItem };
    }

    return normalizedItem;
  });
};

const normalizeOrderResponse = (order) => {
  if (!order) return order;
  const normalized = typeof order.toObject === 'function' ? order.toObject({ virtuals: true }) : { ...order };

  if (normalized.branchId && typeof normalized.branchId === 'object') {
    normalized.branch = normalized.branchId;
    normalized.branchName = normalized.branchName || normalized.branchId.name;
    normalized.branchId =
      normalized.branchId._id?.toString?.() ||
      normalized.branchId.id?.toString?.() ||
      '';
  }

  return normalized;
};

router.get("/test-notify", async (req, res) => {
  try {
    const response = await sendNotificationToDevice(
      "eAgCCEVH0tFzKdq-G0Loq1:APA91bHurIX4PIfjmGIbaZqcqtzTNCb8PGGXB2qfZNZi8KImTY4ypMs5DV_4pBBUpSZrjowF6hEMDGPxMzDjEOQIlBjYJ84q-6BtY7wTa-DKpzSZDq8nkms",
      "Server Test",
      "Your notification system works!"
      
    );
    res.json(response);
  } catch (error) {
    console.error("Notification Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// @desc    Create new order
// @route   POST /api/v1/orders
// @access  Private
// Update your POST /api/v1/orders route
// Update your POST /api/v1/orders route validation
// @desc    Create new order
// @route   POST /api/v1/orders
// @access  Private
router.post('/', [
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  body('items').customSanitizer(normalizeOrderItems),
  body('deliveryType').customSanitizer(normalizeDeliveryType),
  body('paymentMethod').customSanitizer(normalizePaymentMethod),
  body('codPaymentType').optional().customSanitizer(normalizeCodPaymentType),
  body('items').isArray({ min: 1 }).withMessage('Order must contain at least one item'),
  body('items.*.foodItem').custom((foodItem) => {
    const id = foodItem?.id || foodItem?._id || foodItem;
    if (!id || !String(id).match(/^[a-f\d]{24}$/i)) {
      throw new Error('Invalid food item ID');
    }
    return true;
  }),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('deliveryType').isIn(['delivery', 'pickup']).withMessage('Invalid delivery type'),
  body('paymentMethod').isIn(['cash-on-delivery','cashOnDelivery', 'card','shop', 'paypal', 'stripe']).withMessage('Invalid payment method'),
  body('codPaymentType').optional().isIn(['cash', 'card']).withMessage('Invalid COD payment type'),
  body('branchId').optional().isMongoId().withMessage('Invalid branch ID'),
  body('deliveryFee').optional().isFloat({ min: 0 }).withMessage('Delivery fee must be a positive number'),
  body('subtotal').isFloat({ min: 0 }).withMessage('Subtotal must be a positive number'),
  body('total').isFloat({ min: 0 }).withMessage('Total must be a positive number'),
  // Optional in the payload (older app builds never send it), but a phone is
  // still mandatory — see the contactPhone resolution below.
  body('contactPhone').optional({ values: 'falsy' })
    .custom(isValidPhone).withMessage('Invalid phone number'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  // Every order must carry a phone number staff/drivers can call. Older app
  // builds don't collect one at checkout, so fall back to the profile phone
  // and reject the order outright if neither is usable.
  const contactPhone = normalizePhone(req.body.contactPhone) || normalizePhone(req.user.phone);
  if (!isValidPhone(contactPhone)) {
    console.warn(`Order rejected: no valid phone number for user ${req.user.id} (platform: ${req.body.platform || 'unknown'})`);
    return res.status(400).json({
      success: false,
      code: 'PHONE_REQUIRED',
      message: 'A valid phone number is required to place an order. Please add your phone number in your profile or update the app to the latest version.'
    });
  }

const {
    items,
    deliveryType,
    paymentMethod,
    codPaymentType,
    branchId,
    deliveryAddress,
    specialInstructions,
    couponCode,
    deliveryFee: clientDeliveryFee,
    subtotal: clientSubtotal,
    tax: clientTax,
    total: clientTotal,
    platform,
    deviceId,
    applyFirstOrderDiscount
  } = req.body;

  // Validate COD payment type for cash-on-delivery orders
  if ((paymentMethod === 'cashOnDelivery' || paymentMethod === 'cash-on-delivery') && !codPaymentType) {
    return res.status(400).json({
      success: false,
      message: 'COD payment type (cash or card) is required for cash on delivery orders'
    });
  }

  // Validate delivery address for delivery orders
  if (deliveryType === 'delivery' && !deliveryAddress) {
    return res.status(400).json({
      success: false,
      message: 'Delivery address is required for delivery orders'
    });
  }

  // Enforce the delivery radius server-side, regardless of how the client
  // arrived at this address (saved address, one-off entry, stale client
  // state, etc.) — this is the actual gate that decides whether an order
  // gets accepted, so it must not rely solely on the separate check that
  // runs when an address is saved.
  if (deliveryType === 'delivery') {
    const { latitude, longitude } = deliveryAddress;
    if (!validateCoordinates(latitude, longitude)) {
      return res.status(400).json({
        success: false,
        message: 'Delivery address is missing valid coordinates'
      });
    }

    const shop = getShopCoords(req);
    const distance = calculateDistance(shop.lat, shop.lng, latitude, longitude);

    if (distance > MAX_DELIVERY_DISTANCE) {
      return res.status(400).json({
        success: false,
        message: `Address is beyond our ${MAX_DELIVERY_DISTANCE}km delivery range`,
        distance: distance.toFixed(1)
      });
    }
  }

  // Always trust backend-resolved branch context to avoid client branch drift.
  // Any provided body.branchId is treated as optional metadata only.
  const effectiveBranchId = req.branchId;

  // Process cart items - fetch all food items in one query (prevents N+1)
  const itemIds = items.map(item => item.foodItem?.id || item.foodItem);
  const foodItems = await FoodItem.find({ _id: { $in: itemIds }, branchId: req.branchId });
  const foodItemMap = Object.fromEntries(foodItems.map(f => [f._id.toString(), f]));

  let processedItems = [];
  let calculatedSubtotal = 0;

  for (const item of items) {
    const foodItemId = (item.foodItem?.id || item.foodItem).toString();
    const foodItem = foodItemMap[foodItemId];

    if (!foodItem || !foodItem.isActive) {
      return res.status(400).json({
        success: false,
        message: `Food item ${foodItemId} is not available`
      });
    }

    // IMPORTANT: Use unitPrice and totalPrice from frontend
    // Frontend already calculated these including meal size, extras, addons
    const unitPrice = item.unitPrice;
    const totalPrice = item.totalPrice;

    processedItems.push({
      foodItem: foodItem._id,
      quantity: item.quantity,
      selectedMealSize: item.selectedMealSize,
      selectedExtras: item.selectedExtras || [],
      selectedAddons: item.selectedAddons || [],
      specialInstructions: item.specialInstructions,
      unitPrice,
      totalPrice
    });

    calculatedSubtotal += totalPrice;
  }

  // All checks passed — from here on the order is being placed.
  // The account must hold the phone too, not just this order: staff screens
  // show the customer's profile phone, so an existing account without one is
  // updated (and confirmed) first. This is the first write, so if it fails the
  // error propagates before any stock is touched and no order is created.
  if (contactPhone !== normalizePhone(req.user.phone)) {
    await User.findByIdAndUpdate(
      req.user._id,
      { phone: contactPhone },
      { runValidators: true }
    );
  }

  // Aggregate quantities per food item first — the same food item can appear as
  // multiple cart lines (different meal size/addons), and calling save() twice in
  // parallel on the same Mongoose document instance throws "Can't save() the same
  // doc multiple times in parallel".
  const quantityByFoodItemId = {};
  for (const item of items) {
    const foodItemId = (item.foodItem?.id || item.foodItem).toString();
    quantityByFoodItemId[foodItemId] = (quantityByFoodItemId[foodItemId] || 0) + item.quantity;
  }

  await Promise.all(
    Object.entries(quantityByFoodItemId).map(([foodItemId, quantity]) =>
      foodItemMap[foodItemId].updateStock(quantity, 'subtract')
    )
  );

  const deliveryFee = clientDeliveryFee !== undefined ? clientDeliveryFee : 0.0;
  const tax = clientTax !== undefined ? clientTax : 0.0;
  const subtotal = clientSubtotal || calculatedSubtotal;

  // First-order mobile discount — always validated server-side, never trusted from client
  let discount = 0.0;
  let firstOrderDiscountApplied = false;

  if (applyFirstOrderDiscount === true && platform === 'mobile' && deviceId) {
    const userId = req.user._id || req.user.id;

    // These four checks are independent of each other — run them concurrently
    // instead of as four sequential round trips.
    const User = require('../models/User');
    const Setting = require('../models/Setting');
    const [settings, userDoc, priorOrderCount, deviceUsed] = await Promise.all([
      // Global setting check
      Setting.findOne({ branchId: effectiveBranchId }).select('firstOrderDiscountSettings'),
      // Account check: user hasn't already used this discount
      User.findById(userId).select('firstOrderDiscount'),
      // Account check: user has no previous non-cancelled orders
      Order.countDocuments({
        userId,
        branchId: effectiveBranchId,
        status: { $nin: ['cancelled'] }
      }),
      // Device check: this device hasn't used the discount before
      FirstOrderDevice.findOne({ deviceId, branchId: effectiveBranchId }),
    ]);
    const accountUnused = !userDoc?.firstOrderDiscount?.used;
    const discountEnabled = settings?.firstOrderDiscountSettings?.isEnabled !== false; // default true

    if (discountEnabled && accountUnused && priorOrderCount === 0 && !deviceUsed) {
      const pct = (settings?.firstOrderDiscountSettings?.discountPercentage ?? 20) / 100;
      discount = Math.round(subtotal * pct * 100) / 100;
      firstOrderDiscountApplied = true;
    }
  }

  // Use frontend's total but recalculate when first-order discount applies server-side
  const total = firstOrderDiscountApplied
    ? Math.round((subtotal + deliveryFee + tax - discount) * 100) / 100
    : (clientTotal !== undefined ? clientTotal : (subtotal + deliveryFee + tax - discount));

  // orderNumber is generated in the Order pre-save hook (timestamp + random suffix)
  const orderData = {
    userId: req.user._id || req.user.id,
    customerName: [req.user.firstName, req.user.lastName].filter(Boolean).join(' ').trim(),
    customerEmail: req.user.email || '',
    customerPhone: contactPhone,
    items: processedItems,
    subtotal,
    deliveryFee,
    tax,
    discount,
    couponCode,
    total,
    paymentMethod,
    deliveryType,
    deliveryAddress,
    branchId: effectiveBranchId,
    specialInstructions
  };

  // Add COD payment type if applicable
  if (codPaymentType) {
    orderData.codPaymentType = codPaymentType;
  }
  const order = await Order.create(orderData);

  // Persist first-order discount usage so it cannot be reused
  if (firstOrderDiscountApplied) {
    const userId = req.user._id || req.user.id;
    const User = require('../models/User');
    await Promise.all([
      // Mark on user account
      User.findByIdAndUpdate(userId, {
        'firstOrderDiscount.used': true,
        'firstOrderDiscount.usedAt': new Date(),
        'firstOrderDiscount.orderId': order._id
      }),
      // Mark device (upsert in case of race condition)
      FirstOrderDevice.create({
        deviceId,
        branchId: effectiveBranchId,
        userId,
        orderId: order._id,
        discountAmount: discount,
        
      }).catch(() => {})  // ignore duplicate key on race
    ]);
  }

  // Populate order details
  await order.populate([
    { path: 'userId', select: 'firstName lastName email phone fcmToken' },
        { path: 'items.foodItem', select: 'name imageUrl price' },
    { path: 'branchId', select: 'name address phone' },
  ]);

  const orderUserId = order.userId._id ? order.userId._id.toString() : order.userId.toString();

  try {
    // 1. Send notification to customer
    if (order.userId?.fcmToken) {
      await sendOrderStatusNotification(
        orderUserId,
        order,
        'pending'
      );
      console.log('✅ Customer notification sent');
    }

    // 2. Send notification to ALL admins and managers
    const targetBranchId = order.branchId?._id || order.branchId;
    const adminUsers = await User.find({
      role: { $in: ['admin', 'manager', 'superadmin', 'super_admin', 'branch_admin', 'staff'] },
      isActive: true,
      $or: [
        { branchId: targetBranchId },
        { role: { $in: ['superadmin', 'super_admin'] } },
      ],
      // Include users that have either legacy single token or new multi-device tokens
      $and: [
        {
          $or: [
            { fcmToken: { $exists: true, $ne: null } },
            { 'fcmTokens.0': { $exists: true } },
          ],
        },
      ],
    }).select('firstName lastName email fcmToken fcmTokens').lean();

    const branchIdForTopic = targetBranchId?.toString?.() || '';
    const sendBranchTopicFallback = async () => {
      if (!branchIdForTopic) return;
      const topicResult = await sendNotificationToTopic(
        `branch-${branchIdForTopic}`,
        '🔔 New Order Received',
        `Order #${order.orderNumber} - €${order.total.toFixed(2)}`,
        {
          type: 'new_order',
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          total: order.total.toString(),
          branchId: branchIdForTopic,
          timestamp: new Date().toISOString()
        }
      );
      if (topicResult.success) {
        console.log(`✅ Topic notification sent: branch-${branchIdForTopic}`);
      } else {
        console.error('❌ Topic notification failed:', topicResult.error);
      }
    };

    if (adminUsers.length > 0) {
      const adminTokens = [];
      adminUsers.forEach(admin => {
        if (admin.fcmToken) {
          adminTokens.push(admin.fcmToken);
        }
        if (admin.fcmTokens && Array.isArray(admin.fcmTokens)) {
          admin.fcmTokens.forEach(tokenObj => {
            if (tokenObj.token && !adminTokens.includes(tokenObj.token)) {
              adminTokens.push(tokenObj.token);
            }
          });
        }
      });

      const uniqueAdminTokens = [...new Set(adminTokens)];

      if (uniqueAdminTokens.length > 0) {
        const notificationResult = await sendNewOrderNotification(
          uniqueAdminTokens, 
          order
        );

        if (notificationResult.success) {
          console.log('✅ Admin notifications sent successfully');
        } else {
          console.error('❌ Failed to send admin notifications:', notificationResult.error);
        }

        // Fallback: if token-based delivery failed for all recipients, send to branch topic.
        if ((notificationResult.successCount || 0) === 0) {
          await sendBranchTopicFallback();
        }
      }
    } else {
      console.warn(`⚠️ No admin users matched for branch ${targetBranchId?.toString?.() || 'unknown'}`);
      // No token recipients for this branch; deliver through branch topic subscriptions.
      await sendBranchTopicFallback();
    }
  } catch (notificationError) {
    console.error('❌ Error sending notifications:', notificationError);
  }

  const responseOrder = normalizeOrderResponse(order);

  res.status(201).json({
    success: true,
    message: 'Order created successfully',
    order: responseOrder,
    firstOrderDiscountApplied,
    discountAmount: firstOrderDiscountApplied ? discount : undefined
  });
}));



// Replace the /getall route in your orders route file with this:

router.get('/getall', [
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  authorize('admin', 'manager'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('status').optional().isIn(['pending', 'confirmed', 'preparing', 'ready', 'out-for-delivery', 'delivered', 'cancelled']).withMessage('Invalid status'),
  query('search').optional().isString().withMessage('Search must be a string')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { page = 1, limit = 10, status, search } = req.query;
  const skip = (page - 1) * limit;

  let queryFilter = { branchId: req.branchId };
  if (status) queryFilter.status = status;

  // Handle search - need to search in User collection for customer name
  if (search && search.trim()) {
    const searchTerm = search.trim();
    const searchRegex = { $regex: searchTerm, $options: 'i' };

    // First, find matching users
    const matchingUsers = await User.find({
      branchId: req.branchId,
      $or: [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { phone: searchRegex },
        { email: searchRegex }
      ]
    }).select('_id').lean();

    const matchingUserIds = matchingUsers.map(u => u._id);

    // Build search query
    const searchConditions = [
      { orderNumber: searchRegex },
      { 'deliveryAddress.address': searchRegex },
      { 'deliveryAddress.apartment': searchRegex },
      { specialInstructions: searchRegex },
      { customerNotes: searchRegex }
    ];

    // Add user ID matching if we found any users
    if (matchingUserIds.length > 0) {
      searchConditions.push({ userId: { $in: matchingUserIds } });
    }

    // If search looks like an order number
    if (searchTerm.match(/^FK\d+$/i)) {
      queryFilter.orderNumber = searchRegex;
    } else if (searchTerm.match(/^\d+$/)) {
      queryFilter.orderNumber = { $regex: `FK.*${searchTerm}`, $options: 'i' };
    } else {
      queryFilter.$or = searchConditions;
    }
  }

  // Execute query and count in parallel for better performance
  const [orders, totalOrders] = await Promise.all([
    Order.find(queryFilter)
      .populate([
        { path: 'items.foodItem', select: 'name imageUrl price' },
        { path: 'branchId', select: 'name address phone' },
        { path: 'userId', select: 'firstName lastName phone email' }
      ])
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .lean(),
    Order.countDocuments(queryFilter)
  ]);

  const totalPages = Math.ceil(totalOrders / limit);

  res.json({
    success: true,
    count: orders.length,
    totalOrders,
    totalPages,
    currentPage: parseInt(page),
    orders: orders.map(normalizeOrderResponse)
  });
}));
router.get('/stats', [
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  authorize('admin', 'manager'),

], asyncHandler(async (req, res) => {

  const {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    endDate = new Date(),
    
  } = req.query;

  const stats = await Order.getOrderStats(
    new Date(startDate),
    new Date(endDate),
    req.branchId
  );

  res.json({
    success: true,
    stats
  });
}));
// @desc    Get user orders
// @route   GET /api/v1/orders
// @access  Private
router.get('/', [
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('status').optional().isIn(['pending', 'confirmed', 'preparing', 'ready', 'out-for-delivery', 'delivered', 'cancelled']).withMessage('Invalid status')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { page = 1, limit = 10, status } = req.query;
  const skip = (page - 1) * limit;

  let query = {
    branchId: req.branchId,
    userId: req.user.id || req.user._id || req.user.userId,
  };
  if (status) query.status = status;



  // Run query and count in parallel for better performance
  const [orders, totalOrders] = await Promise.all([
    Order.find(query)
      .populate([
        { path: 'items.foodItem', select: 'name imageUrl price' },
        { path: 'branchId', select: 'name address phone' }
      ])
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .lean(),
    Order.countDocuments(query)
  ]);

  const totalPages = Math.ceil(totalOrders / limit);

  res.json({
    success: true,
    count: orders.length,
    totalOrders,
    totalPages,
    currentPage: parseInt(page),
    orders: orders.map(normalizeOrderResponse)
  });
}));

// @desc    Check first-order mobile discount eligibility
// @route   GET /api/v1/orders/first-order-discount/check
// @access  Private
router.get('/first-order-discount/check', [
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  query('deviceId').notEmpty().withMessage('deviceId is required')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { deviceId } = req.query;
  const userId = req.user._id || req.user.id;

  // These four independent checks are fetched concurrently, then evaluated
  // in the exact same priority order as before (disabled_by_admin →
  // account_used → has_orders → device_used) so the returned `reason` is
  // unchanged for every case — only the fetching is now parallel.
  const Setting = require('../models/Setting');
  const [settings, user, existingOrderCount, deviceRecord] = await Promise.all([
    Setting.findOne({ branchId: req.branchId }).select('firstOrderDiscountSettings'),
    require('../models/User').findById(userId).select('firstOrderDiscount'),
    Order.countDocuments({
      userId,
      branchId: req.branchId,
      status: { $nin: ['cancelled'] }
    }),
    FirstOrderDevice.findOne({ deviceId, branchId: req.branchId }),
  ]);

  // Global setting check: is the first-order discount enabled by admin?
  const discountEnabled = settings?.firstOrderDiscountSettings?.isEnabled !== false; // default true
  if (!discountEnabled) {
    return res.json({ success: true, eligible: false, reason: 'disabled_by_admin' });
  }

  // Account check: has this user already used the first-order discount?
  if (user?.firstOrderDiscount?.used) {
    return res.json({ success: true, eligible: false, reason: 'account_used' });
  }

  // Account check: does this user already have a non-cancelled order?
  if (existingOrderCount > 0) {
    return res.json({ success: true, eligible: false, reason: 'has_orders' });
  }

  // Device check: has this device already used the first-order discount on any account?
  if (deviceRecord) {
    return res.json({ success: true, eligible: false, reason: 'device_used' });
  }

  return res.json({
    success: true,
    eligible: true,
    discountPercentage: 20,
    message: '20% off your first order!'
  });
}));

// @desc    Get single order
// @route   GET /api/v1/orders/:id
// @access  Private
router.get('/:id', [
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  param('id').isMongoId().withMessage('Invalid order ID')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const order = await Order.findOne({ _id: req.params.id, branchId: req.branchId })
    .populate([
      { path: 'userId', select: 'firstName lastName email phone' },
      { path: 'items.foodItem', select: 'name imageUrl price description' },
      { path: 'branchId', select: 'name address phone' },
      { path: 'deliveryAgent', select: 'firstName lastName phone' }
    ]);

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'Order not found'
    });
  }

  const orderUserId = order.userId._id ? order.userId._id.toString() : order.userId.toString();

  const currentUserId = (req.user._id || req.user.id || req.user.userId)?.toString();
  
const staffRoles = ['admin', 'manager', 'branch_admin', 'staff', 'super_admin', 'superadmin'];
if (
  orderUserId !== currentUserId &&
  !staffRoles.includes(req.user.role)
) {
  return res.status(403).json({
    success: false,
    message: 'Not authorized to access this order'
  });
}


  res.json({
    success: true,
    order: normalizeOrderResponse(order)
  });
}));

// @desc    Get live tracking info for an order (REST fallback / initial paint
//          before the socket connects — see sockets/orderTrackingHandlers.js
//          for the live-update channel)
// @route   GET /api/v1/orders/:id/tracking
// @access  Private (owner, assigned driver, or branch staff)
router.get('/:id/tracking', [
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  param('id').isMongoId().withMessage('Invalid order ID')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const order = await Order.findOne({ _id: req.params.id, branchId: req.branchId })
    .populate([
      { path: 'deliveryAgent', select: 'firstName lastName phone driverStatus' },
      { path: 'branchId', select: 'name latitude longitude phone' }
    ]);

  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  const currentUserId = (req.user._id || req.user.id || req.user.userId)?.toString();
  const isOwner = order.userId.toString() === currentUserId;
  const isAssignedDriver = order.deliveryAgent && order.deliveryAgent._id.toString() === currentUserId;
  const isStaff = STAFF_ROLES.includes(req.user.role);

  if (!isOwner && !isAssignedDriver && !isStaff) {
    return res.status(403).json({ success: false, message: 'Not authorized to access this order tracking' });
  }

  const lastPingAt = order.deliveryTracking?.lastPingAt;
  const isStale = Boolean(
    order.deliveryTracking?.isLive &&
    lastPingAt &&
    (Date.now() - new Date(lastPingAt).getTime()) > 60000
  );

  res.json({
    success: true,
    tracking: {
      orderId: order._id,
      status: order.status,
      trackingStage: getTrackingStage(order.status),
      trackingStageLabel: getTrackingStageLabel(order.status),
      driver: order.deliveryAgent
        ? {
            id: order.deliveryAgent._id,
            firstName: order.deliveryAgent.firstName,
            lastName: order.deliveryAgent.lastName,
            phone: order.deliveryAgent.phone,
            vehicleType: order.deliveryAgent.driverStatus?.vehicleType || null
          }
        : null,
      location: order.deliveryTracking?.currentLocation || null,
      isLive: Boolean(order.deliveryTracking?.isLive),
      isStale,
      startedAt: order.deliveryTracking?.startedAt || null,
      estimatedDeliveryTime: order.estimatedDeliveryTime || null,
      estimatedTimeRemaining: order.estimatedTimeRemaining,
      branch: order.branchId
        ? { name: order.branchId.name, latitude: order.branchId.latitude, longitude: order.branchId.longitude }
        : null,
      destination: order.deliveryAddress
        ? {
            latitude: order.deliveryAddress.latitude,
            longitude: order.deliveryAddress.longitude,
            address: order.deliveryAddress.address
          }
        : null
    }
  });
}));

// @desc    Assign a driver to an order
// @route   PATCH /api/v1/orders/:id/assign-driver
// @access  Private (Admin/Manager only)
router.patch('/:id/assign-driver', [
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  authorize('admin', 'manager'),
  param('id').isMongoId().withMessage('Invalid order ID'),
  body('driverId').isMongoId().withMessage('Invalid driver ID')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { driverId } = req.body;

  const [order, driver] = await Promise.all([
    Order.findOne({ _id: req.params.id, branchId: req.branchId }),
    User.findOne({ _id: driverId, branchId: req.branchId, role: 'driver' })
  ]);

  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }
  if (!driver) {
    return res.status(404).json({ success: false, message: 'Driver not found in this branch' });
  }
  if (['delivered', 'cancelled', 'refunded'].includes(order.status)) {
    return res.status(400).json({ success: false, message: 'Cannot assign a driver to a completed order' });
  }

  order.deliveryAgent = driver._id;
  await order.save();

  try {
    await sendDeliveryAssignmentNotification(driver, order);
  } catch (err) {
    console.error('Delivery assignment notification failed:', err.message);
  }

  const io = req.app.get('io');
  if (io) {
    const driverPayload = {
      id: driver._id.toString(),
      firstName: driver.firstName,
      lastName: driver.lastName,
      phone: driver.phone,
      vehicleType: driver.driverStatus?.vehicleType || null
    };
    io.to(`driver:${driver._id.toString()}`).emit('order:driver_assigned', {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber
    });
    io.to(`order:${order._id.toString()}`).emit('order:driver_assigned', {
      orderId: order._id.toString(),
      driver: driverPayload
    });
  }

  res.json({
    success: true,
    message: 'Driver assigned successfully',
    order: { id: order._id, deliveryAgent: order.deliveryAgent }
  });
}));

// @desc    Update order status
// @route   PATCH /api/v1/orders/:id/status
// @access  Private (Admin/Manager only)
router.patch('/:id/status', [
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  authorize('admin', 'manager'),
  param('id').isMongoId().withMessage('Invalid order ID'),
  body('status').isIn(['pending', 'confirmed', 'preparing', 'pickup', 'ready', 'shop', 'driverpickup', 'out-for-delivery', 'delivered', 'cancelled']).withMessage('Invalid status'),
  body('message').optional().trim()
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { status, message } = req.body;

  const order = await Order.findOne({ _id: req.params.id, branchId: req.branchId });

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'Order not found'
    });
  }

  // Explicitly set the status FIRST
  order.status = status;

  // Add tracking update
  order.addTrackingUpdate(
    status,
    message || `Order status updated to ${status}`,
    null
  );

  // Set actual delivery time if delivered
  if (status === 'delivered' && !order.actualDeliveryTime) {
    order.actualDeliveryTime = new Date();
  }

  // Auto-assign a driver the moment a delivery order is accepted, so admin
  // doesn't have to remember to do it separately later. Only when there
  // isn't one already (e.g. re-confirming) and only among drivers who are
  // actually online right now — if none are, the order is simply left
  // unassigned for admin to assign manually, same as before this existed.
  let autoAssignedDriver = null;
  if (status === 'confirmed' && order.deliveryType === 'delivery' && !order.deliveryAgent) {
    autoAssignedDriver = await pickAvailableDriver(order.branchId);
    if (autoAssignedDriver) {
      order.deliveryAgent = autoAssignedDriver._id;
    }
  }

  // Mark status as modified to ensure it's saved
  order.markModified('status');

  // Save the order after all updates
  await order.save();

  // `order` already has the just-saved status/tracking in memory — populate
  // its refs in place instead of re-fetching the whole document from Mongo.
  const orderDoc = await order.populate([
    { path: 'userId', select: 'firstName lastName email phone' },
    { path: 'items.foodItem', select: 'name imageUrl price description' },
    { path: 'branchId', select: 'name address phone' },
    { path: 'deliveryAgent', select: 'firstName lastName phone driverStatus' }
  ]);

  const orderUserId = orderDoc.userId._id ? orderDoc.userId._id.toString() : orderDoc.userId.toString();

  await sendOrderStatusNotification(
    orderUserId,
    orderDoc,
    status,
    message ? { title: '📦 Order Update', body: message } : null
  );

  if (autoAssignedDriver && orderDoc.deliveryAgent) {
    try {
      await sendDeliveryAssignmentNotification(orderDoc.deliveryAgent, orderDoc);
    } catch (err) {
      console.error('Auto-assignment notification failed:', err.message);
    }
  }

  const io = req.app.get('io');
  if (io) {
    io.to(`order:${orderDoc._id.toString()}`).emit('order:status_changed', {
      orderId: orderDoc._id.toString(),
      status,
      trackingStage: getTrackingStage(status),
      trackingStageLabel: getTrackingStageLabel(status),
      message: message || null,
      timestamp: new Date().toISOString()
    });

    if (autoAssignedDriver && orderDoc.deliveryAgent) {
      const driverPayload = {
        id: orderDoc.deliveryAgent._id.toString(),
        firstName: orderDoc.deliveryAgent.firstName,
        lastName: orderDoc.deliveryAgent.lastName,
        phone: orderDoc.deliveryAgent.phone,
        vehicleType: orderDoc.deliveryAgent.driverStatus?.vehicleType || null
      };
      io.to(`driver:${orderDoc.deliveryAgent._id.toString()}`).emit('order:driver_assigned', {
        orderId: orderDoc._id.toString(),
        orderNumber: orderDoc.orderNumber
      });
      io.to(`order:${orderDoc._id.toString()}`).emit('order:driver_assigned', {
        orderId: orderDoc._id.toString(),
        driver: driverPayload
      });
    }
  }

  res.json({
    success: true,
    message: 'Order status updated successfully',
    order: {
      id: orderDoc._id,
      status: orderDoc.status,
      estimatedTimeRemaining: orderDoc.estimatedTimeRemaining,
      autoAssignedDriver: autoAssignedDriver
        ? { id: autoAssignedDriver._id, firstName: autoAssignedDriver.firstName, lastName: autoAssignedDriver.lastName }
        : null
    }
  });
}));

// @desc    Driver-only delivery status update (picked up / out for delivery /
//          delivered) — kept deliberately separate from the admin/manager
//          PATCH /:id/status above so that endpoint's existing authorization
//          and validators stay completely untouched.
// @route   PATCH /api/v1/orders/:id/driver-status
// @access  Private (assigned driver only)
router.patch('/:id/driver-status', [
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  authorize('driver'),
  param('id').isMongoId().withMessage('Invalid order ID'),
  body('status').isIn(['driverpickup', 'pickup', 'out-for-delivery', 'delivered', 'failed-delivery']).withMessage('Invalid status'),
  body('message').optional().trim(),
  body('reason').if(body('status').equals('failed-delivery')).trim().notEmpty().withMessage('Reason is required when marking a delivery as failed')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { status, message, reason } = req.body;
  const order = await Order.findOne({ _id: req.params.id, branchId: req.branchId });

  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  const currentUserId = (req.user._id || req.user.id || req.user.userId)?.toString();
  if (!order.deliveryAgent || order.deliveryAgent.toString() !== currentUserId) {
    return res.status(403).json({ success: false, message: 'You are not the assigned driver for this order' });
  }

  const location = order.deliveryTracking?.currentLocation
    ? {
        latitude: order.deliveryTracking.currentLocation.latitude,
        longitude: order.deliveryTracking.currentLocation.longitude
      }
    : null;

  order.addTrackingUpdate(status, message || (status === 'failed-delivery' ? `Delivery failed: ${reason}` : `Order status updated to ${status}`), location);

  if (status === 'delivered' || status === 'failed-delivery') {
    order.deliveryTracking = order.deliveryTracking || {};
    order.deliveryTracking.isLive = false;
    order.deliveryTracking.endedAt = new Date();
    order.markModified('deliveryTracking');
  }

  if (status === 'delivered') {
    order.actualDeliveryTime = new Date();
  }

  if (status === 'failed-delivery') {
    order.failedDelivery = {
      reason,
      failedAt: new Date(),
      failedBy: currentUserId
    };
  }

  order.markModified('status');
  await order.save();

  const orderDoc = await order.populate([{ path: 'userId', select: 'firstName lastName email phone' }]);
  const orderUserId = orderDoc.userId._id ? orderDoc.userId._id.toString() : orderDoc.userId.toString();

  try {
    await sendOrderStatusNotification(
      orderUserId,
      orderDoc,
      status,
      message ? { title: '📦 Order Update', body: message } : null
    );
  } catch (err) {
    console.error('Driver-status notification failed:', err.message);
  }

  // Let the branch's admins/managers know as soon as a driver finishes (or
  // fails) a delivery, instead of them having to keep the dashboard open.
  if (status === 'delivered' || status === 'failed-delivery') {
    try {
      const branchAdmins = await User.find({
        role: { $in: ['admin', 'manager', 'superadmin', 'super_admin', 'branch_admin', 'staff'] },
        isActive: true,
        $or: [
          { branchId: req.branchId },
          { role: { $in: ['superadmin', 'super_admin'] } },
        ],
        $and: [
          {
            $or: [
              { fcmToken: { $exists: true, $ne: null } },
              { 'fcmTokens.0': { $exists: true } },
            ],
          },
        ],
      }).select('fcmToken fcmTokens').lean();

      const adminTokens = [];
      branchAdmins.forEach((admin) => {
        if (admin.fcmToken) adminTokens.push(admin.fcmToken);
        if (Array.isArray(admin.fcmTokens)) {
          admin.fcmTokens.forEach((t) => {
            if (t.token && !adminTokens.includes(t.token)) adminTokens.push(t.token);
          });
        }
      });

      if (adminTokens.length > 0) {
        await sendDeliveryCompletedNotification(adminTokens, order, req.user, status);
      }
    } catch (err) {
      console.error('Admin delivery-completed notification failed:', err.message);
    }
  }

  const io = req.app.get('io');
  if (io) {
    io.to(`order:${order._id.toString()}`).emit('order:status_changed', {
      orderId: order._id.toString(),
      status,
      trackingStage: getTrackingStage(status),
      trackingStageLabel: getTrackingStageLabel(status),
      message: message || null,
      timestamp: new Date().toISOString()
    });
    if (status === 'out-for-delivery') {
      io.to(`order:${order._id.toString()}`).emit('order:driver_started', { orderId: order._id.toString() });
    }
    if (status === 'delivered' || status === 'failed-delivery') {
      io.to(`order:${order._id.toString()}`).emit('order:driver_ended', {
        orderId: order._id.toString(),
        reason: status === 'delivered' ? 'delivered' : 'failed-delivery'
      });
    }
  }

  res.json({
    success: true,
    message: 'Delivery status updated successfully',
    order: { id: order._id, status: order.status, failedDelivery: order.failedDelivery }
  });
}));

// @desc    Cancel order
// @route   PATCH /api/v1/orders/:id/cancel
// @access  Private

router.patch('/:id/cancel', [
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  param('id').isMongoId().withMessage('Invalid order ID'),
  body('reason').trim().notEmpty().withMessage('Cancellation reason is required')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { reason } = req.body;
  const order = await Order.findOne({ _id: req.params.id, branchId: req.branchId });

  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  // Authorization
  const currentUserId = (req.user._id || req.user.id || req.user.userId)?.toString();
  const isOwner = order.userId.toString() === currentUserId;
  const isAdmin = ['admin', 'manager', 'superadmin', 'super_admin', 'branch_admin', 'staff'].includes(req.user.role);
  if (!isOwner && !isAdmin) {
    return res.status(403).json({ success: false, message: 'Not authorized' });
  }

  if (['delivered', 'cancelled', 'refunded'].includes(order.status)) {
    return res.status(400).json({ success: false, message: 'Order cannot be cancelled' });
  }

  const cancelledBy = isAdmin ? 'admin' : 'customer';

  // Apply cancellation logic (no save yet)
  order.cancelOrder(reason, cancelledBy);

  // Restore stock — batch-fetch all items in one query (same pattern used at
  // order-creation time above) instead of one findOne+save per cart line.
  const restoreItemIds = order.items.map(item => item.foodItem);
  const restoreFoodItems = await FoodItem.find({ _id: { $in: restoreItemIds }, branchId: req.branchId });
  const restoreFoodItemMap = Object.fromEntries(restoreFoodItems.map(f => [f._id.toString(), f]));

  // Aggregate quantities per food item first — the same food item can appear
  // as multiple cart lines, and calling save() twice in parallel on the same
  // Mongoose document instance throws "Can't save() the same doc multiple
  // times in parallel".
  const restoreQuantityByFoodItemId = {};
  for (const item of order.items) {
    const foodItemId = item.foodItem.toString();
    restoreQuantityByFoodItemId[foodItemId] = (restoreQuantityByFoodItemId[foodItemId] || 0) + item.quantity;
  }

  await Promise.all(
    Object.entries(restoreQuantityByFoodItemId)
      .filter(([foodItemId]) => restoreFoodItemMap[foodItemId])
      .map(([foodItemId, quantity]) => restoreFoodItemMap[foodItemId].updateStock(quantity, 'add'))
  );

  // SINGLE SAVE — ONLY HERE!
  await order.save();

  // Send notification
  try {
    await sendOrderStatusNotification(
      order.userId.toString(),
      order,
      'cancelled',
      { title: 'Order Cancelled', body: reason }
    );
  } catch (err) {
    console.error('Notification failed:', err);
  }

  const io = req.app.get('io');
  if (io) {
    io.to(`order:${order._id.toString()}`).emit('order:status_changed', {
      orderId: order._id.toString(),
      status: order.status,
      trackingStage: getTrackingStage(order.status),
      trackingStageLabel: getTrackingStageLabel(order.status),
      message: reason,
      timestamp: new Date().toISOString()
    });
  }

  res.json({
    success: true,
    message: 'Order cancelled successfully',
    order: {
      id: order._id,
      status: order.status,
      cancellation: order.cancellation
    }
  });
}));

// @desc    Add rating to order
// @route   POST /api/v1/orders/:id/rating
// @access  Private
router.post('/:id/rating', [
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  param('id').isMongoId().withMessage('Invalid order ID'),
  body('food').optional().isInt({ min: 1, max: 5 }).withMessage('Food rating must be between 1 and 5'),
  body('delivery').optional().isInt({ min: 1, max: 5 }).withMessage('Delivery rating must be between 1 and 5'),
  body('overall').isInt({ min: 1, max: 5 }).withMessage('Overall rating must be between 1 and 5'),
  body('comment').optional().trim().isLength({ max: 500 }).withMessage('Comment cannot exceed 500 characters')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const order = await Order.findOne({ _id: req.params.id, branchId: req.branchId });

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'Order not found'
    });
  }

  // Check if user owns this order
  const currentUserId = (req.user._id || req.user.id || req.user.userId)?.toString();
  if (order.userId.toString() !== currentUserId) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to rate this order'
    });
  }

  // Check if order is delivered
  if (order.status !== 'delivered') {
    return res.status(400).json({
      success: false,
      message: 'Can only rate delivered orders'
    });
  }

  // Check if already rated
  if (order.rating && order.rating.overall) {
    return res.status(400).json({
      success: false,
      message: 'Order has already been rated'
    });
  }

  await order.addRating(req.body);

  res.json({
    success: true,
    message: 'Rating added successfully'
  });
}));

// @desc    Get order statistics (Admin/Manager only)
// @route   GET /api/v1/orders/stats
// @access  Private (Admin/Manager only)


module.exports = router;