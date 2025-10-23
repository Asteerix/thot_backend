const config = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0'),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'thot:',
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    enableOfflineQueue: false
  },

  cache: {
    ttl: {
      default: 3600, // 1 hour
      posts: 300, // 5 minutes
      user: 600, // 10 minutes
      trending: 1800, // 30 minutes
      static: 86400 // 24 hours
    },
    enabled: process.env.CACHE_ENABLED !== 'false'
  },

  memoryCache: {
    max: 500, // maximum items in cache
    ttl: 300, // 5 minutes default
    updateAgeOnGet: true
  }
};

module.exports = config;