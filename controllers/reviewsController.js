const axios = require('axios');
const Branch = require('../models/Branch');

// Server-side only — never send this to a client.
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY;

const PLACES_TEXT_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const PLACES_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';

const DETAIL_FIELDS = [
  'name',
  'rating',
  'user_ratings_total',
  'price_level',
  'formatted_address',
  'opening_hours',
  'reviews',
  'types',
].join(',');

// In-memory cache: branchId -> { data, expiresAt }. Google Places pricing is
// per-request, so we cache aggressively — reviews don't need to be
// second-fresh, and this keeps the homepage section fast.
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const cache = new Map();

const priceLevelToRange = (level) => {
  switch (level) {
    case 0: return '€';
    case 1: return '€1–10';
    case 2: return '€10–20';
    case 3: return '€20–40';
    case 4: return '€40+';
    default: return null;
  }
};

const guessCategory = (types = []) => {
  if (types.includes('hamburger_restaurant') || types.includes('meal_takeaway')) return 'Hamburger';
  if (types.includes('restaurant')) return 'Restaurant';
  return 'Food';
};

async function resolvePlaceId(branch) {
  if (branch.googlePlaceId) return branch.googlePlaceId;

  const query = `${branch.name} ${branch.location || branch.address || ''}`.trim();
  const { data } = await axios.get(PLACES_TEXT_SEARCH_URL, {
    params: { query, key: GOOGLE_API_KEY },
    timeout: 8000,
  });

  const placeId = data?.results?.[0]?.place_id;
  if (!placeId) return null;

  // Cache the resolved id on the branch so we never Text-Search again.
  Branch.findByIdAndUpdate(branch._id, { googlePlaceId: placeId }).catch(() => {});
  return placeId;
}

async function fetchPlaceDetails(placeId) {
  const { data } = await axios.get(PLACES_DETAILS_URL, {
    params: { place_id: placeId, fields: DETAIL_FIELDS, key: GOOGLE_API_KEY },
    timeout: 8000,
  });

  if (data.status !== 'OK') {
    throw new Error(`Places Details error: ${data.status}`);
  }
  return data.result;
}

function formatBranchReviews(branch, details) {
  const reviews = (details.reviews || [])
    .slice(0, 5)
    .map((r) => ({
      author: r.author_name,
      authorPhoto: r.profile_photo_url || null,
      rating: r.rating,
      text: r.text,
      relativeTime: r.relative_time_description,
    }));

  return {
    branchId: branch._id,
    name: branch.name,
    location: branch.location || details.formatted_address || '',
    rating: details.rating ?? null,
    reviewCount: details.user_ratings_total ?? 0,
    priceRange: priceLevelToRange(details.price_level),
    category: guessCategory(details.types),
    openNow: details.opening_hours?.open_now ?? null,
    reviews,
  };
}

// @desc   Google Places rating/review summary for active branches (public,
//         cached — see CACHE_TTL_MS). Used by the homepage reviews section.
// @route  GET /api/v1/reviews/google
const getGoogleReviews = async (req, res) => {
  if (!GOOGLE_API_KEY) {
    return res.status(500).json({ success: false, error: 'Google Places API key not configured' });
  }

  try {
    const branches = await Branch.find({ isActive: true }).sort({ name: 1 }).lean();

    const results = await Promise.all(
      branches.map(async (branch) => {
        const cached = cache.get(String(branch._id));
        if (cached && cached.expiresAt > Date.now()) {
          return cached.data;
        }

        try {
          const placeId = await resolvePlaceId(branch);
          if (!placeId) return null;

          const details = await fetchPlaceDetails(placeId);
          const formatted = formatBranchReviews(branch, details);

          cache.set(String(branch._id), { data: formatted, expiresAt: Date.now() + CACHE_TTL_MS });
          return formatted;
        } catch (err) {
          console.error(`Google reviews fetch failed for branch ${branch.name}:`, err.message);
          return null;
        }
      })
    );

    const places = results.filter(Boolean);
    res.json({ success: true, count: places.length, places });
  } catch (error) {
    console.error('getGoogleReviews error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to load reviews' });
  }
};

const clearCache = (req, res) => {
  cache.clear();
  res.json({ success: true, message: 'Reviews cache cleared' });
};

module.exports = { getGoogleReviews, clearCache };
