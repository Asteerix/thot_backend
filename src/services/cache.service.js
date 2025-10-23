const NodeCache = require('node-cache');

/**
 * Cache Service - Centralized cache management
 * Provides cache instances and business logic for different data types
 */
class CacheService {
  constructor() {
    // Create cache instances with different TTL for different types of data
    this.caches = {
      posts: new NodeCache({ stdTTL: 300 }), // 5 minutes
      users: new NodeCache({ stdTTL: 600 }), // 10 minutes
      journalists: new NodeCache({ stdTTL: 600 }), // 10 minutes
      trending: new NodeCache({ stdTTL: 180 }), // 3 minutes
      general: new NodeCache({ stdTTL: 300 }) // 5 minutes default
    };
  }

  /**
   * Get data from cache
   * @param {string} cacheName - Name of cache instance
   * @param {string} key - Cache key
   * @returns {any|null} Cached data or null if not found
   */
  get(cacheName, key) {
    try {
      const cache = this.caches[cacheName] || this.caches.general;
      return cache.get(key);
    } catch (err) {
      console.error('Cache read error:', err);
      return null;
    }
  }

  /**
   * Set data in cache
   * @param {string} cacheName - Name of cache instance
   * @param {string} key - Cache key
   * @param {any} data - Data to cache
   * @param {number} ttl - Time to live in seconds (optional)
   */
  set(cacheName, key, data, ttl = null) {
    try {
      const cache = this.caches[cacheName] || this.caches.general;
      if (ttl) {
        cache.set(key, data, ttl);
      } else {
        cache.set(key, data);
      }
      console.log(`Cached data for: ${cacheName}/${key}`);
    } catch (err) {
      console.error('Cache write error:', err);
    }
  }

  /**
   * Clear entire cache instance
   * @param {string} cacheName - Name of cache instance to clear
   */
  clearCache(cacheName) {
    if (cacheName && this.caches[cacheName]) {
      this.caches[cacheName].flushAll();
      console.log(`Cache cleared: ${cacheName}`);
    } else {
      // Clear all caches
      Object.keys(this.caches).forEach((name) => {
        this.caches[name].flushAll();
      });
      console.log('All caches cleared');
    }
  }

  /**
   * Invalidate specific cache key
   * @param {string} cacheName - Name of cache instance
   * @param {string} key - Cache key to invalidate
   */
  invalidateCache(cacheName, key) {
    const cache = this.caches[cacheName] || this.caches.general;
    cache.del(key);
    console.log(`Cache invalidated: ${cacheName}/${key}`);
  }

  /**
   * Get cache statistics
   * @param {string} cacheName - Name of cache instance
   * @returns {object} Cache statistics
   */
  getStats(cacheName) {
    const cache = this.caches[cacheName] || this.caches.general;
    return cache.getStats();
  }

  /**
   * Generate cache key for posts
   * @param {object} params - Query parameters
   * @param {string} userId - User ID for personalized caching
   * @returns {string} Generated cache key
   */
  generatePostsKey(params, userId = 'anonymous') {
    const { page = 1, limit = 20, type, domain, journalist, sort } = params;
    return `posts:${page}:${limit}:${type || 'all'}:${domain || 'all'}:${
      journalist || 'all'
    }:${sort || 'recent'}:user_${userId}`;
  }

  /**
   * Generate cache key for user profile
   * @param {string} userId - User ID
   * @returns {string} Generated cache key
   */
  generateUserProfileKey(userId) {
    return `user:${userId}`;
  }

  /**
   * Generate cache key for journalist profile
   * @param {string} journalistId - Journalist ID
   * @returns {string} Generated cache key
   */
  generateJournalistProfileKey(journalistId) {
    return `journalist:${journalistId}`;
  }

  /**
   * Generate cache key for trending content
   * @param {string} type - Content type
   * @returns {string} Generated cache key
   */
  generateTrendingKey(type = 'all') {
    const timeWindow = Math.floor(Date.now() / (1000 * 60 * 3)); // 3-minute windows
    return `trending:${type}:${timeWindow}`;
  }
}

module.exports = new CacheService();