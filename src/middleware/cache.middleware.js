const cacheService = require('../services/cache.service');

// Cache middleware generator
const cacheMiddleware = (cacheName = 'general', keyGenerator) => {
  return (req, res, next) => {
    // Skip cache for non-GET requests or if cache is disabled
    if (req.method !== 'GET' || req.headers['cache-control'] === 'no-cache') {
      return next();
    }

    // Skip cache for authenticated users to ensure personalized data
    if (req.user) {
      console.log(`Cache skipped for authenticated user: ${req.user._id}`);
      return next();
    }

    const key = keyGenerator ? keyGenerator(req) : req.originalUrl;

    const cachedData = cacheService.get(cacheName, key);
    if (cachedData) {
      console.log(`Cache hit for: ${key}`);
      return res.json(cachedData);
    }

    // Store original res.json
    const originalJson = res.json;

    // Override res.json to cache the response
    res.json = function (data) {
      // Only cache successful responses
      if (res.statusCode === 200 && data) {
        cacheService.set(cacheName, key, data);
      }

      // Call original res.json
      originalJson.call(this, data);
    };

    next();
  };
};

// Clear cache function - delegate to service
const clearCache = (cacheName) => {
  cacheService.clearCache(cacheName);
};

// Invalidate specific cache key - delegate to service
const invalidateCache = (cacheName, key) => {
  cacheService.invalidateCache(cacheName, key);
};

// Key generators for different routes - delegate to service
const keyGenerators = {
  posts: (req) => {
    const userId = req.user ? req.user._id.toString() : 'anonymous';
    return cacheService.generatePostsKey(req.query, userId);
  },
  userProfile: (req) => cacheService.generateUserProfileKey(req.params.id),
  journalistProfile: (req) => cacheService.generateJournalistProfileKey(req.params.id),
  trending: (req) => cacheService.generateTrendingKey(req.query.type)
};

module.exports = {
  cacheMiddleware,
  clearCache,
  invalidateCache,
  keyGenerators
};
