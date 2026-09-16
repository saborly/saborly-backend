const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Order = require('../models/Order');
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { attachBranchToRequest, resolveBranchContext } = require('../middleware/branchContext');
const { getTrackingStage, getTrackingStageLabel } = require('../utils/trackingStageMap');
const { ACTIVE_DRIVER_STATUSES } = require('../utils/driverAssignment');

const router = express.Router();

function serializeDriverOrder(order) {
  return {
    id: order._id,
    orderNumber: order.orderNumber,
    status: order.status,
    trackingStage: getTrackingStage(order.status),
    trackingStageLabel: getTrackingStageLabel(order.status),
    total: order.total,
    deliveryType: order.deliveryType,
    deliveryAddress: order.deliveryAddress,
    specialInstructions: order.specialInstructions,
    customer: order.userId
      ? { firstName: order.userId.firstName, lastName: order.userId.lastName, phone: order.userId.phone }
      : null,
    branch: order.branchId
      ? {
          id: order.branchId._id,
          name: order.branchId.name,
          latitude: order.branchId.latitude,
          longitude: order.branchId.longitude,
          phone: order.branchId.phone
        }
      : null,
    deliveryTracking: order.deliveryTracking || null,
    createdAt: order.createdAt
  };
}

// @desc    Get the driver's current active order (if any)
// @route   GET /api/v1/drivers/me/active-order
// @access  Private (driver)
router.get('/me/active-order', [
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  authorize('driver')
], asyncHandler(async (req, res) => {
  const driverId = req.user._id || req.user.id;

  const order = await Order.findOne({
    deliveryAgent: driverId,
    status: { $in: ACTIVE_DRIVER_STATUSES }
  })
    .populate([
      { path: 'userId', select: 'firstName lastName phone' },
      { path: 'branchId', select: 'name latitude longitude phone' }
    ])
    .sort({ updatedAt: -1 });

  res.json({ success: true, order: order ? serializeDriverOrder(order) : null });
}));

// @desc    List orders assigned to the driver (defaults to non-terminal orders)
// @route   GET /api/v1/drivers/me/assigned-orders
// @access  Private (driver)
router.get('/me/assigned-orders', [
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  authorize('driver'),
  query('status').optional().isString()
], asyncHandler(async (req, res) => {
  const driverId = req.user._id || req.user.id;
  const filter = { deliveryAgent: driverId };
  if (req.query.status) {
    filter.status = req.query.status;
  } else {
    filter.status = { $nin: ['delivered', 'cancelled', 'refunded'] };
  }

  const orders = await Order.find(filter)
    .populate([
      { path: 'userId', select: 'firstName lastName phone' },
      { path: 'branchId', select: 'name latitude longitude phone' }
    ])
    .sort({ createdAt: -1 });

  res.json({ success: true, orders: orders.map(serializeDriverOrder) });
}));

// @desc    Driver's past deliveries
// @route   GET /api/v1/drivers/me/delivery-history
// @access  Private (driver)
router.get('/me/delivery-history', [
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  authorize('driver'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const driverId = req.user._id || req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const filter = { deliveryAgent: driverId, status: { $in: ['delivered', 'cancelled'] } };

  const [orders, totalOrders] = await Promise.all([
    Order.find(filter)
      .populate([{ path: 'userId', select: 'firstName lastName' }])
      .sort({ updatedAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean(),
    Order.countDocuments(filter)
  ]);

  res.json({
    success: true,
    count: orders.length,
    totalOrders,
    totalPages: Math.ceil(totalOrders / limit),
    currentPage: page,
    orders: orders.map((o) => ({ ...o, trackingStage: getTrackingStage(o.status) }))
  });
}));

// @desc    Toggle the driver's online/available status + vehicle type
// @route   PATCH /api/v1/drivers/me/online-status
// @access  Private (driver)
router.patch('/me/online-status', [
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  authorize('driver'),
  body('isOnline').optional().isBoolean(),
  body('isAvailable').optional().isBoolean(),
  body('vehicleType').optional().isIn(['bike', 'motorcycle', 'car', 'on_foot'])
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const driverId = req.user._id || req.user.id;
  const update = { 'driverStatus.lastSeenAt': new Date() };
  if (req.body.isOnline !== undefined) update['driverStatus.isOnline'] = req.body.isOnline;
  if (req.body.isAvailable !== undefined) update['driverStatus.isAvailable'] = req.body.isAvailable;
  if (req.body.vehicleType !== undefined) update['driverStatus.vehicleType'] = req.body.vehicleType;

  const driver = await User.findByIdAndUpdate(driverId, { $set: update }, { new: true }).select('driverStatus');

  res.json({ success: true, driverStatus: driver.driverStatus });
}));

// @desc    Create a driver account for the admin's active branch
// @route   POST /api/v1/drivers
// @access  Private (admin/manager)
router.post('/', [
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  authorize('admin', 'manager'),
  body('firstName')
    .trim()
    .notEmpty()
    .withMessage('First name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  body('lastName')
    .trim()
    .notEmpty()
    .withMessage('Last name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('phone')
    .matches(/^\+?[\d\s-()]+$/)
    .withMessage('Please provide a valid phone number'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('vehicleType')
    .optional({ nullable: true, checkFalsy: true })
    .isIn(['bike', 'motorcycle', 'car', 'on_foot'])
    .withMessage('Invalid vehicle type')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
  }

  const { firstName, lastName, email, phone, password, vehicleType } = req.body;

  const existingUser = await User.findOne({
    branchId: req.branchId,
    $or: [{ email }, { phone }]
  }).select('email phone').lean();

  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: existingUser.email === email
        ? 'A driver with this email already exists in this branch'
        : 'A driver with this phone number already exists in this branch'
    });
  }

  const driver = await User.create({
    firstName,
    lastName,
    email,
    phone,
    password,
    branchId: req.branchId,
    role: 'driver',
    emailVerified: true,
    driverStatus: {
      isOnline: false,
      isAvailable: true,
      ...(vehicleType ? { vehicleType } : {})
    }
  });

  res.status(201).json({
    success: true,
    driver: {
      id: driver._id,
      firstName: driver.firstName,
      lastName: driver.lastName,
      email: driver.email,
      phone: driver.phone,
      branchId: driver.branchId,
      driverStatus: driver.driverStatus
    }
  });
}));

// @desc    Branch-scoped list of drivers (for the admin's assign-driver picker)
// @route   GET /api/v1/drivers/available
// @access  Private (admin/manager)
router.get('/available', [
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  authorize('admin', 'manager')
], asyncHandler(async (req, res) => {
  const drivers = await User.find({
    branchId: req.branchId,
    role: 'driver',
    isActive: true
  })
    .select('firstName lastName phone driverStatus')
    .sort({ 'driverStatus.isOnline': -1, firstName: 1 });

  res.json({ success: true, drivers });
}));

// @desc    Branch-scoped active deliveries (for the admin Live Deliveries map)
// @route   GET /api/v1/drivers/active-deliveries
// @access  Private (admin/manager)
router.get('/active-deliveries', [
  auth,
  attachBranchToRequest,
  resolveBranchContext,
  authorize('admin', 'manager')
], asyncHandler(async (req, res) => {
  const orders = await Order.find({
    branchId: req.branchId,
    deliveryAgent: { $ne: null },
    status: { $in: ACTIVE_DRIVER_STATUSES }
  })
    .populate([
      { path: 'userId', select: 'firstName lastName phone' },
      { path: 'deliveryAgent', select: 'firstName lastName phone driverStatus' }
    ])
    .sort({ updatedAt: -1 });

  res.json({
    success: true,
    orders: orders.map((order) => ({
      id: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      trackingStage: getTrackingStage(order.status),
      deliveryAddress: order.deliveryAddress,
      customer: order.userId
        ? { firstName: order.userId.firstName, lastName: order.userId.lastName, phone: order.userId.phone }
        : null,
      driver: order.deliveryAgent
        ? {
            id: order.deliveryAgent._id,
            firstName: order.deliveryAgent.firstName,
            lastName: order.deliveryAgent.lastName,
            phone: order.deliveryAgent.phone,
            vehicleType: order.deliveryAgent.driverStatus?.vehicleType || null
          }
        : null,
      deliveryTracking: order.deliveryTracking || null
    }))
  });
}));

module.exports = router;
