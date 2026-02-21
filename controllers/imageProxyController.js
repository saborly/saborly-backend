const axios = require('axios');
const url = require('url');

// Allowed domains for security
const ALLOWED_DOMAINS = [
  'vercel-storage.com',
  'blob.vercel-storage.com',
  'isjqrgksamsoj2tf.public.blob.vercel-storage.com',
  'images.unsplash.com',
  'cloudinary.com',
  'res.cloudinary.com',
  // Add your trusted image domains here
];

// Cache configuration
const CACHE_DURATION = 7 * 24 * 60 * 60; // 7 days in seconds
const cache = new Map();

// Validate URL function
const isValidUrl = (urlString) => {
  try {
    const parsedUrl = new URL(urlString);
    const hostname = parsedUrl.hostname;
    
    // Check if domain is allowed
    return ALLOWED_DOMAINS.some(domain => hostname.includes(domain));
  } catch {
    return false;
  }
};

// Get content type from file extension or URL
const getContentType = (urlString) => {
  const extension = urlString.split('.').pop()?.toLowerCase();
  const contentTypes = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'ico': 'image/x-icon',
  };
  
  return contentTypes[extension] || 'application/octet-stream';
};

// Main proxy controller
const proxyImage = async (req, res) => {
  try {
    const imageUrl = req.query.url;
    
    if (!imageUrl) {
      return res.status(400).json({ 
        success: false, 
        error: 'URL parameter is required' 
      });
    }

    // Validate URL
    if (!isValidUrl(imageUrl)) {
      return res.status(403).json({ 
        success: false, 
        error: 'Domain not allowed' 
      });
    }

    // Check cache
    if (cache.has(imageUrl)) {
      const cachedData = cache.get(imageUrl);
      res.setHeader('Content-Type', cachedData.contentType);
      res.setHeader('Cache-Control', `public, max-age=${CACHE_DURATION}`);
      res.setHeader('X-Cache', 'HIT');
      return res.send(cachedData.data);
    }

    // Fetch image with timeout and proper headers
    const response = await axios({
      method: 'get',
      url: imageUrl,
      responseType: 'arraybuffer',
      timeout: 10000, // 10 second timeout
      maxContentLength: 10 * 1024 * 1024, // 10MB max
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.saborly.es',
        'Origin': 'https://www.saborly.es',
        'Cache-Control': 'no-cache',
      },
    });

    const contentType = response.headers['content-type'] || getContentType(imageUrl);
    const imageData = response.data;

    // Store in cache (with size limit)
    if (cache.size < 100) { // Limit cache size to prevent memory issues
      cache.set(imageUrl, {
        data: imageData,
        contentType: contentType,
        timestamp: Date.now(),
      });
    }

    // Set response headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', `public, max-age=${CACHE_DURATION}`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.setHeader('X-Cache', 'MISS');

    // Send image
    res.send(imageData);

  } catch (error) {
    console.error('Image proxy error:', error.message);

    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({ 
        success: false, 
        error: 'Request timeout' 
      });
    }

    if (error.response) {
      return res.status(error.response.status).json({ 
        success: false, 
        error: `Remote server error: ${error.response.status}` 
      });
    }

    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch image' 
    });
  }
};

// Options handler for CORS preflight
const handleOptions = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  res.status(204).send();
};

// Clear cache endpoint (admin only)
const clearCache = (req, res) => {
  cache.clear();
  res.json({ 
    success: true, 
    message: 'Cache cleared successfully' 
  });
};

// Get cache stats (admin only)
const getCacheStats = (req, res) => {
  const stats = {
    size: cache.size,
    keys: Array.from(cache.keys()),
    oldest: cache.size > 0 ? Math.min(...Array.from(cache.values()).map(v => v.timestamp)) : null,
  };
  res.json({ 
    success: true, 
    stats 
  });
};

module.exports = {
  proxyImage,
  handleOptions,
  clearCache,
  getCacheStats,
};