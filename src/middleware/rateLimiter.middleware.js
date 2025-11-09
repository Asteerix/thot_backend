const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

// Try to load Redis dependencies if available
let RedisStore, redisClient;
try {
  // Only initialize Redis if explicitly configured
  if (process.env.REDIS_HOST && process.env.REDIS_HOST !== 'localhost') {
    const Redis = require('ioredis');
    RedisStore = require('rate-limit-redis');

    redisClient = new Redis({
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          console.warn('Redis connection failed after 3 retries, falling back to memory store');
          return null; // Stop retrying
        }
        return Math.min(times * 100, 2000);
      }
    });

    redisClient.on('error', (err) => {
      console.error('Redis connection error:', err);
      redisClient = null;
    });

    redisClient.on('ready', () => {
      console.log('✓ Redis connected for rate limiting');
    });
  } else {
    console.log('ℹ Redis not configured (REDIS_HOST not set), using memory store for rate limiting');
    redisClient = null;
  }
} catch (error) {
  console.log('ℹ Redis not available, using memory store for rate limiting:', error.message);
  redisClient = null;
}

// Base limiter configuration
const createLimiter = (options) => {
  const baseConfig = {
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(options.status || 429).json({
        success: false,
        message: options.message || 'Too many requests, please try again later.',
        retryAfter: Math.round(options.windowMs / 1000)
      });
    },
    skip: (req) => {
      // Skip rate limiting for admin users
      return req.user && req.user.role === 'admin';
    },
    keyGenerator: (req) => {
      // Use user ID if authenticated, otherwise use IP with IPv6 support
      return req.user ? `user_${req.user._id}` : ipKeyGenerator(req);
    }
  };

  // Add Redis store if available
  const config = {
    ...baseConfig,
    ...options
  };

  if (redisClient && redisClient.status === 'ready' && RedisStore) {
    config.store = new RedisStore({
      client: redisClient,
      prefix: `rate_limit:${options.name || 'default'}:`
    });
  }

  return rateLimit(config);
};

// Different rate limiters for different endpoints
const limiters = {
  // Strict limiter for auth endpoints
  auth: createLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // 30 requests per window - increased from 20
    message: 'Too many authentication attempts, please try again later.',
    skipSuccessfulRequests: true
  }),

  // Registration limiter (even stricter)
  register: createLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 registrations per hour per IP
    message: 'Too many registration attempts, please try again later.'
  }),

  // Password reset limiter
  passwordReset: createLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 password reset requests per hour
    message: 'Too many password reset attempts, please try again later.'
  }),

  // General API limiter
  api: createLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 2000, // 2000 requests per window - increased from 1500
    message: 'Too many requests, please slow down.'
  }),

  // Strict limiter for write operations
  write: createLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 150, // 150 write operations per window - increased from 100
    message: 'Too many write operations, please slow down.'
  }),

  // Upload limiter
  upload: createLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 30, // 30 uploads per hour - increased from 20
    message: 'Too many uploads, please try again later.'
  }),

  // Search limiter
  search: createLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // 30 searches per minute
    message: 'Too many search requests, please slow down.'
  }),

  // Report limiter
  report: createLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 reports per hour
    message: 'Too many reports submitted, please try again later.'
  }),

  // Comment limiter
  comment: createLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // 50 comments per 15 minutes - increased from 20
    message: 'Too many comments, please slow down.'
  }),

  // Like/interaction limiter
  interaction: createLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 500, // 500 interactions per minute - increased from 300
    message: 'Too many interactions, please slow down.',
    name: 'interaction'
  }),

  // Follow action limiter
  follow: createLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 150, // 150 follow actions per minute
    message: 'Too many follow actions, please wait.',
    name: 'follow',
    skip: (req) => !req.user, // Only apply to authenticated users
    keyGenerator: (req) => req.user ? `user_${req.user._id}` : ipKeyGenerator(req)
  }),

  // Strict rapid action limiter
  strictAction: createLimiter({
    windowMs: 10 * 1000, // 10 seconds
    max: 50, // 50 actions per 10 seconds
    message: 'Action too fast detected. Please wait.',
    name: 'strict_action',
    keyGenerator: (req) => {
      const userId = req.user?._id || ipKeyGenerator(req);
      return `${userId}:${req.path}:${req.body?.postId || req.params?.id}`;
    }
  }),

  // Likes rate limiter (per user)
  likes: createLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 likes per minute
    message: 'Too many likes! Please wait before continuing.',
    name: 'likes',
    keyGenerator: (req) => req.user?._id?.toString() || ipKeyGenerator(req)
  }),

  // Strict likes limiter (prevent rapid clicking)
  strictLikes: createLimiter({
    windowMs: 10 * 1000, // 10 seconds
    max: 5, // 5 likes per 10 seconds
    message: 'You are clicking too fast! Please slow down.',
    name: 'strict_likes',
    keyGenerator: (req) => {
      const userId = req.user?._id?.toString() || ipKeyGenerator(req);
      const postId = req.params.id;
      return `${userId}:${postId}`;
    }
  }),

  // Global likes limiter (prevent system overload)
  globalLikes: createLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 1000, // 1000 likes per minute globally
    message: 'The system is currently overloaded. Please try again.',
    name: 'global_likes',
    status: 503,
    keyGenerator: () => 'global_likes',
    skip: () => false // Apply to everyone
  })
};

// Dynamic rate limiter based on user role
const createDynamicLimiter = (baseLimit) => {
  return (req, res, next) => {
    let multiplier = 1;

    if (req.user) {
      switch (req.user.role) {
      case 'admin':
        return next(); // No limit for admins
      case 'journalist':
        multiplier = 2; // Double limit for journalists
        break;
      case 'premium':
        multiplier = 1.5; // 50% more for premium users
        break;
      }
    }

    const dynamicLimiter = createLimiter({
      windowMs: 15 * 60 * 1000,
      max: Math.round(baseLimit * multiplier),
      keyGenerator: (req) => {
        // Use user ID if authenticated, otherwise use IP with IPv6 support
        return req.user ? `user:${req.user._id}` : ipKeyGenerator(req);
      }
    });

    dynamicLimiter(req, res, next);
  };
};

// General rate limiter for all API routes
const generalLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1500, // 1500 requests per window for general API access - increased from 1000
  message: 'Too many requests from this IP, please try again later.'
});

// Convenience exports for backward compatibility
const likesRateLimiter = limiters.likes;
const strictLikesRateLimiter = limiters.strictLikes;
const globalLikesRateLimiter = limiters.globalLikes;
const followRateLimiter = limiters.follow;
const strictActionRateLimiter = limiters.strictAction;

// Combined rate limiters array
const applyLikeRateLimiters = [
  globalLikesRateLimiter,
  likesRateLimiter,
  strictLikesRateLimiter
];

module.exports = {
  limiters,
  createDynamicLimiter,
  generalLimiter,
  // Specific limiters for backward compatibility
  likesRateLimiter,
  strictLikesRateLimiter,
  globalLikesRateLimiter,
  followRateLimiter,
  strictActionRateLimiter,
  applyLikeRateLimiters
};
