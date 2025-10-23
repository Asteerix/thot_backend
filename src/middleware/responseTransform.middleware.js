/**
 * Response Transformation Middleware
 *
 * Ensures all API responses use proper transformation methods (getPublicData, getPublicProfile, etc.)
 * Prevents raw Mongoose documents from being sent to clients
 * Guarantees consistency between backend and mobile DTO structures
 */

/**
 * Transform a single document to public format
 */
function transformDocument(doc, userId = null) {
  if (!doc) {
    return null;
  }

  // Already a plain object
  if (!(doc.toObject || doc.toJSON)) {
    return doc;
  }

  // Use model-specific transformation methods
  if (typeof doc.getPublicData === 'function') {
    return doc.getPublicData(userId);
  }

  if (typeof doc.getPublicProfile === 'function') {
    return doc.getPublicProfile(userId);
  }

  // Fallback to toJSON
  return doc.toJSON ? doc.toJSON() : doc;
}

/**
 * Transform response data recursively
 */
function transformData(data, userId = null) {
  if (!data) {
    return data;
  }

  // Array of documents
  if (Array.isArray(data)) {
    return data.map(item => transformDocument(item, userId));
  }

  // Single document
  if (data.toObject || data.toJSON || typeof data.getPublicData === 'function') {
    return transformDocument(data, userId);
  }

  // Object with nested documents (e.g., { posts: [], user: {} })
  if (typeof data === 'object') {
    const transformed = {};
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        transformed[key] = value.map(item => transformDocument(item, userId));
      } else if (value && (value.toObject || value.toJSON)) {
        transformed[key] = transformDocument(value, userId);
      } else {
        transformed[key] = value;
      }
    }
    return transformed;
  }

  return data;
}

/**
 * Middleware to automatically transform response data
 *
 * Usage:
 * - Add to routes: router.get('/', responseTransform, controller.getItems)
 * - Or add globally in app.js after route registration
 */
function responseTransform(req, res, next) {
  // Store original json method
  const originalJson = res.json.bind(res);

  // Override json method
  res.json = function(body) {
    if (body && typeof body === 'object') {
      // Extract success flag and other metadata
      const { success, message, error, pagination, ...rest } = body;

      // Transform data field if it exists
      if (body.data !== undefined) {
        const userId = req.user?._id;
        const transformedData = transformData(body.data, userId);

        return originalJson({
          success,
          message,
          error,
          pagination,
          data: transformedData,
          ...rest
        });
      }

      // If no data field, try to transform the whole body
      const userId = req.user?._id;
      const transformed = transformData(body, userId);
      return originalJson(transformed);
    }

    // Not an object, return as-is
    return originalJson(body);
  };

  next();
}

/**
 * Ensure User model responses are flattened (stats.postsCount → postsCount)
 */
function ensureFlattenedUserStats(user) {
  if (!user) {
    return user;
  }

  const userData = user.toObject ? user.toObject() : { ...user };

  // Flatten stats if nested
  if (userData.stats && typeof userData.stats === 'object') {
    userData.postsCount = userData.stats.postsCount || 0;
    userData.followersCount = userData.stats.followersCount || 0;
    userData.followingCount = userData.stats.followingCount || 0;
    userData.commentsCount = userData.stats.commentsCount || 0;
    userData.reactionsCount = userData.stats.reactionsCount || 0;
  }

  return userData;
}

/**
 * Ensure Post interactions are in count format (not array format)
 */
function ensureFlattenedInteractions(post) {
  if (!post) {
    return post;
  }

  const postData = post.toObject ? post.toObject() : { ...post };

  // Transform interactions structure
  if (postData.interactions) {
    const interactions = {};

    // Likes
    if (postData.interactions.likes) {
      interactions.likesCount = postData.interactions.likes.count ||
                                postData.interactions.likes.users?.length || 0;
    }

    // Dislikes
    if (postData.interactions.dislikes) {
      interactions.dislikesCount = postData.interactions.dislikes.count ||
                                    postData.interactions.dislikes.users?.length || 0;
    }

    // Comments
    if (postData.interactions.comments) {
      interactions.commentsCount = postData.interactions.comments.count ||
                                    postData.interactions.comments.users?.length || 0;
    }

    // Bookmarks
    if (postData.interactions.bookmarks) {
      interactions.bookmarksCount = postData.interactions.bookmarks.count ||
                                     postData.interactions.bookmarks.users?.length || 0;
    }

    // Reports
    if (postData.interactions.reports) {
      interactions.reportsCount = postData.interactions.reports.count ||
                                   postData.interactions.reports.users?.length || 0;
    }

    postData.interactions = { ...postData.interactions, ...interactions };
  }

  return postData;
}

/**
 * Validation middleware - ensures response matches expected structure
 * Logs warnings if transformations are missing
 */
function validateResponseStructure(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = function(body) {
    if (body?.data) {
      const data = Array.isArray(body.data) ? body.data[0] : body.data;

      // Check if User model response has flattened stats
      if (data && data.role && data.stats && !data.followersCount) {
        console.warn('⚠️  [Response Validation] User response has nested stats instead of flattened fields');
        console.warn('   Route:', req.method, req.originalUrl);
      }

      // Check if Post model has interaction arrays instead of counts
      if (data && data.type && data.interactions?.likes?.users && !data.interactions.likesCount) {
        console.warn('⚠️  [Response Validation] Post response has interaction arrays instead of counts');
        console.warn('   Route:', req.method, req.originalUrl);
        console.warn('   Post ID:', data._id || data.id);
      }
    }

    return originalJson(body);
  };

  next();
}

module.exports = {
  responseTransform,
  transformDocument,
  transformData,
  ensureFlattenedUserStats,
  ensureFlattenedInteractions,
  validateResponseStructure
};
