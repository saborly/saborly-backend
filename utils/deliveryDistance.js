// Single source of truth for the delivery radius, used by both the order flow
// (routes/orderRoutes.js) and the saved-address flow (controllers/Addresscontroller.js).
//
// A delivery is allowed only if BOTH the straight-line distance and the real
// driving distance from the branch are within MAX_DELIVERY_DISTANCE_KM.
// Straight-line alone is not enough: an address 3.3 km away "as the crow flies"
// can be 5-8 km by road. If the driving distance cannot be verified
// (Google unreachable, quota, no route) the address is rejected — never allowed.

const { calculateDistance } = require('./locationUtils');

const MAX_DELIVERY_DISTANCE_KM = 3.5;
const DISTANCE_MATRIX_URL = 'https://maps.googleapis.com/maps/api/distancematrix/json';
const LOOKUP_TIMEOUT_MS = 6000;

// Branch coordinates from the resolved branch doc; Barcelona main branch as fallback.
function getShopCoords(req) {
  const doc = req.branchDoc;
  if (doc && doc.latitude != null && doc.longitude != null) {
    return { lat: doc.latitude, lng: doc.longitude };
  }
  return { lat: 41.4037, lng: 2.2004 };
}

async function getDrivingDistanceKm(shop, lat, lng) {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) return null;
  try {
    const url = `${DISTANCE_MATRIX_URL}?origins=${shop.lat},${shop.lng}&destinations=${lat},${lng}&mode=driving&key=${key}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
    if (!res.ok) return null;
    const data = await res.json();
    const el = data.status === 'OK' && data.rows?.[0]?.elements?.[0];
    if (!el || el.status !== 'OK' || typeof el.distance?.value !== 'number') return null;
    return el.distance.value / 1000;
  } catch (err) {
    console.error('Driving distance lookup failed:', err.message);
    return null;
  }
}

/**
 * @returns {Promise<{ allowed: boolean, reason: 'ok'|'too_far'|'unverifiable',
 *                     straightKm: number, drivingKm: number|null }>}
 */
async function checkDeliveryDistance(shop, lat, lng) {
  const straightKm = calculateDistance(shop.lat, shop.lng, lat, lng);
  if (straightKm > MAX_DELIVERY_DISTANCE_KM) {
    return { allowed: false, reason: 'too_far', straightKm, drivingKm: null };
  }
  const drivingKm = await getDrivingDistanceKm(shop, lat, lng);
  if (drivingKm == null) {
    return { allowed: false, reason: 'unverifiable', straightKm, drivingKm: null };
  }
  if (drivingKm > MAX_DELIVERY_DISTANCE_KM) {
    return { allowed: false, reason: 'too_far', straightKm, drivingKm };
  }
  return { allowed: true, reason: 'ok', straightKm, drivingKm };
}

// Express response for a failed check. `distance` is the larger known distance.
function sendDistanceRejection(res, check) {
  const distance = Math.max(check.straightKm, check.drivingKm ?? 0);
  if (check.reason === 'unverifiable') {
    return res.status(503).json({
      success: false,
      message: 'We could not verify the delivery distance right now. Please try again in a moment.',
    });
  }
  return res.status(400).json({
    success: false,
    message: `Address is beyond our ${MAX_DELIVERY_DISTANCE_KM}km delivery range`,
    distance: distance.toFixed(1),
  });
}

module.exports = { MAX_DELIVERY_DISTANCE_KM, getShopCoords, checkDeliveryDistance, sendDistanceRejection };
