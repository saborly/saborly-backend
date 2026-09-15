// Maps the existing Order.status enum onto the 5-stage customer-facing
// progression (Order Confirmed -> Preparing -> Picked Up -> On the Way ->
// Delivered) WITHOUT adding any new status values to the schema/validators.
// This is a pure derived view, reused by the tracking REST payload, the
// socket broadcasts, and mirrored client-side — a single source of truth
// instead of duplicating this mapping in every app.
const STATUS_TO_STAGE = {
  pending: 0,
  confirmed: 1,
  preparing: 2,
  ready: 2,
  driverpickup: 3,
  pickup: 3,
  shop: 3,
  'out-for-delivery': 4,
  delivered: 5,
  cancelled: -1,
  refunded: -1
};

const STAGE_LABELS = {
  0: 'Order Placed',
  1: 'Order Confirmed',
  2: 'Preparing',
  3: 'Picked Up',
  4: 'On the Way',
  5: 'Delivered'
};

function getTrackingStage(status) {
  const stage = STATUS_TO_STAGE[status];
  return stage === undefined ? 0 : stage;
}

function getTrackingStageLabel(status) {
  const stage = getTrackingStage(status);
  if (stage === -1) return status === 'refunded' ? 'Refunded' : 'Cancelled';
  return STAGE_LABELS[stage] || status;
}

module.exports = { getTrackingStage, getTrackingStageLabel, STATUS_TO_STAGE };
