/**
 * Helper functions for admin controllers
 */

/**
 * Error messages constants
 */
const ERROR_MESSAGES = {
  USER_NOT_FOUND: 'User not found',
  JOURNALIST_NOT_FOUND: 'Journalist not found',
  POST_NOT_FOUND: 'Post not found',
  REPORT_NOT_FOUND: 'Signalement non trouvé',
  COMMENT_NOT_FOUND: 'Comment not found',
  SHORT_NOT_FOUND: 'Short not found',
  REASON_REQUIRED: 'Reason is required',
  INVALID_ROLE: 'Invalid role',
  CANNOT_SUSPEND_SELF: 'You cannot suspend your own account',
  CANNOT_BAN_SELF: 'You cannot ban your own account',
  CANNOT_CHANGE_OWN_ROLE: 'You cannot change your own role',
  CANNOT_BAN_ADMIN: 'Cannot ban another admin',
  CANNOT_SUSPEND_ADMIN: 'Cannot suspend another admin',
  USER_NOT_BANNED_OR_SUSPENDED: 'User is not banned or suspended'
};

/**
 * Success messages constants
 */
const SUCCESS_MESSAGES = {
  JOURNALIST_VERIFIED: 'Journaliste vérifié avec succès',
  JOURNALIST_UNVERIFIED: 'Vérification retirée',
  REPORT_PROCESSED: 'Signalement traité avec succès',
  CONTENT_DELETED: 'Contenu supprimé avec succès',
  POST_DELETED: 'Post deleted successfully',
  COMMENT_DELETED: 'Comment deleted successfully',
  SHORT_DELETED: 'Short deleted successfully',
  USER_SUSPENDED: 'User suspended successfully',
  USER_BANNED: 'User banned successfully',
  USER_UNBANNED: 'User unbanned successfully',
  ROLE_UPDATED: 'User role updated successfully',
  JOURNALIST_APPROVED: 'Journaliste approuvé',
  JOURNALIST_REJECTED: 'Journalist rejected successfully',
  JOURNALIST_UNVERIFIED_SUCCESS: 'Journalist unverified successfully'
};

/**
 * Valid user roles
 */
const VALID_ROLES = ['user', 'admin', 'journalist'];

/**
 * Report target types
 */
const REPORT_TARGET_TYPES = {
  POST: 'post',
  COMMENT: 'comment',
  USER: 'user',
  SHORT: 'short'
};

/**
 * Content types for deletion
 */
const CONTENT_TYPES = {
  POST: 'post',
  COMMENT: 'comment',
  SHORT: 'short'
};

/**
 * User status values
 */
const USER_STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  BANNED: 'banned',
  REJECTED: 'rejected'
};

/**
 * Calculate time periods for statistics
 * @returns {Object} - Date filters for different time periods
 */
function getDateFilters() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return {
    today,
    weekAgo: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000),
    monthAgo: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
  };
}

/**
 * Build journalist query with filters
 * @param {Object} params - Query parameters
 * @returns {Object} - MongoDB query object
 */
function buildJournalistQuery(params) {
  const { search, status, hasPressCard } = params;
  const query = { role: 'journalist' };

  // Add search filter
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { username: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { organization: { $regex: search, $options: 'i' } },
      { pressCard: { $regex: search, $options: 'i' } }
    ];
  }

  // Add verification status filter
  if (status === 'verified') {
    query.isVerified = true;
    query.status = USER_STATUS.ACTIVE;
  } else if (status === 'suspended') {
    query.status = USER_STATUS.SUSPENDED;
  } else if (status) {
    query.status = status;
  }

  // Add press card filter
  if (hasPressCard === 'true') {
    query.pressCard = { $exists: true, $ne: null };
  } else if (hasPressCard === 'false') {
    query.$or = [
      { pressCard: { $exists: false } },
      { pressCard: null },
      { pressCard: '' }
    ];
  }

  return query;
}

/**
 * Build user query with filters
 * @param {Object} params - Query parameters
 * @returns {Object} - MongoDB query object
 */
function buildUserQuery(params) {
  const { search, role, status } = params;
  const query = {};

  // Add role filter (exclude journalists by default)
  if (role) {
    query.role = role;
  } else {
    query.role = { $ne: 'journalist' };
  }

  // Add status filter
  if (status) {
    query.status = status;
  }

  // Add search filter
  if (search) {
    query.$or = [
      { username: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { name: { $regex: search, $options: 'i' } }
    ];
  }

  return query;
}

/**
 * Format journalist data for response
 * @param {Object} journalist - Journalist document
 * @returns {Object} - Formatted journalist object
 */
function formatJournalistData(journalist) {
  const journalistObj = journalist.toObject();

  return {
    ...journalistObj,
    id: journalistObj._id,
    postsCount: journalistObj.stats?.postes || 0,
    followersCount: journalistObj.followers?.length || 0,
    followingCount: journalistObj.following?.length || 0,
    isVerified: journalistObj.isVerified || false
  };
}

/**
 * Format user data for response
 * @param {Object} user - User document
 * @returns {Object} - Formatted user object
 */
function formatUserData(user) {
  const userObj = user.toObject();

  return {
    ...userObj,
    id: userObj._id,
    postsCount: userObj.stats?.postes || 0,
    followersCount: userObj.followers?.length || 0,
    followingCount: userObj.following?.length || 0,
    isVerified: userObj.isVerified || false
  };
}

/**
 * Validate user action permissions
 * @param {string} targetUserId - ID of user being acted upon
 * @param {string} actorUserId - ID of user performing action
 * @param {string} targetRole - Role of target user
 * @param {string} action - Action being performed
 * @returns {Object|null} - Error object if validation fails, null otherwise
 */
function validateUserAction(targetUserId, actorUserId, targetRole, action) {
  // Check if trying to perform action on self
  if (targetUserId === actorUserId) {
    return {
      status: 403,
      message: action === 'suspend' ? ERROR_MESSAGES.CANNOT_SUSPEND_SELF :
        action === 'ban' ? ERROR_MESSAGES.CANNOT_BAN_SELF :
          ERROR_MESSAGES.CANNOT_CHANGE_OWN_ROLE
    };
  }

  // Check if trying to perform action on another admin
  if (targetRole === 'admin') {
    return {
      status: 403,
      message: action === 'suspend' ? ERROR_MESSAGES.CANNOT_SUSPEND_ADMIN :
        action === 'ban' ? ERROR_MESSAGES.CANNOT_BAN_ADMIN :
          ERROR_MESSAGES.CANNOT_BAN_ADMIN
    };
  }

  return null;
}

/**
 * Build pagination metadata
 * @param {number} total - Total number of items
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @returns {Object} - Pagination metadata
 */
function buildPaginationMetadata(total, page, limit) {
  return {
    currentPage: parseInt(page),
    totalPages: Math.ceil(total / parseInt(limit)),
    totalItems: total,
    itemsPerPage: parseInt(limit)
  };
}

module.exports = {
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  VALID_ROLES,
  REPORT_TARGET_TYPES,
  CONTENT_TYPES,
  USER_STATUS,
  getDateFilters,
  buildJournalistQuery,
  buildUserQuery,
  formatJournalistData,
  formatUserData,
  validateUserAction,
  buildPaginationMetadata
};