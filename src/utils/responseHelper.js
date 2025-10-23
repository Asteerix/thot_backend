/* eslint-disable */
/**
 * Standard API Response Helper
 * Ensures consistent response format across all endpoints
 */

class ResponseHelper {
  /**
   * Send success response
   * @param {Object} res - Express response object
   * @param {Object} data - Response data
   * @param {String} message - Success message
   * @param {Number} statusCode - HTTP status code (default: 200)
   */
  static success(res, data = null, message = 'Success', statusCode = 200) {
    const response = {
      success: true,
      message
    };

    if (data !== null && data !== undefined) {
      response.data = data;
    }

    return res.status(statusCode).json(response);
  }

  /**
   * Send error response
   * @param {Object} res - Express response object
   * @param {String} message - Error message
   * @param {Number} statusCode - HTTP status code (default: 400)
   * @param {String} code - Error code
   * @param {Object} details - Additional error details
   */
  static error(res, message = 'An error occurred', statusCode = 400, code = null, details = null) {
    const response = {
      success: false,
      message
    };

    if (code) {
      response.code = code;
    }

    if (details) {
      response.details = details;
    }

    return res.status(statusCode).json(response);
  }

  /**
   * Send created response
   * @param {Object} res - Express response object
   * @param {Object} data - Created resource data
   * @param {String} message - Success message
   */
  static created(res, data, message = 'Resource created successfully') {
    return this.success(res, data, message, 201);
  }

  /**
   * Send no content response
   * @param {Object} res - Express response object
   */
  static noContent(res) {
    return res.status(204).send();
  }

  /**
   * Send paginated response
   * @param {Object} res - Express response object
   * @param {Array} items - Array of items
   * @param {Number} page - Current page
   * @param {Number} totalPages - Total pages
   * @param {Number} totalItems - Total items count
   * @param {String} itemsKey - Key name for items array (default: 'items')
   */
  static paginated(res, items, page, totalPages, totalItems, itemsKey = 'items') {
    return this.success(res, {
      [itemsKey]: items,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: items.length,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  }

  /**
   * Send validation error response
   * @param {Object} res - Express response object
   * @param {Array} errors - Validation errors
   */
  static validationError(res, errors) {
    return this.error(res, 'Validation failed', 422, 'VALIDATION_ERROR', errors);
  }

  /**
   * Send unauthorized response
   * @param {Object} res - Express response object
   * @param {String} message - Error message
   */
  static unauthorized(res, message = 'Unauthorized') {
    return this.error(res, message, 401, 'UNAUTHORIZED');
  }

  /**
   * Send forbidden response
   * @param {Object} res - Express response object
   * @param {String} message - Error message
   */
  static forbidden(res, message = 'Forbidden') {
    return this.error(res, message, 403, 'FORBIDDEN');
  }

  /**
   * Send not found response
   * @param {Object} res - Express response object
   * @param {String} resource - Resource name
   */
  static notFound(res, resource = 'Resource') {
    return this.error(res, `${resource} not found`, 404, 'NOT_FOUND');
  }

  /**
   * Send conflict response
   * @param {Object} res - Express response object
   * @param {String} message - Error message
   */
  static conflict(res, message = 'Resource already exists') {
    return this.error(res, message, 409, 'CONFLICT');
  }

  /**
   * Send server error response
   * @param {Object} res - Express response object
   * @param {Error} error - Error object
   * @param {String} message - Error message
   */
  static serverError(res, error = null, message = 'Internal server error') {
    if (process.env.NODE_ENV === 'development' && error) {
      console.error('Server Error:', error);
    }
    
    return this.error(res, message, 500, 'SERVER_ERROR');
  }

  /**
   * Format post interactions for consistent API response
   * Always returns simple integers for counts, not objects
   * @param {Object} post - Post document with interactions
   * @param {String} userId - Current user ID for isLiked/isSaved flags
   * @returns {Object} Formatted interactions object
   */
  static formatInteractions(post, userId = null) {
    const interactions = post.interactions || {};
    
    return {
      likes: interactions.likes?.count || 0,
      dislikes: interactions.dislikes?.count || 0,
      comments: interactions.comments?.count || 0,
      reports: interactions.reports?.count || 0,
      bookmarks: interactions.bookmarks?.count || 0,
      isLiked: userId ? 
        (interactions.likes?.users?.some(u => u.user?.toString() === userId.toString()) || false) : 
        false,
      isSaved: userId ? 
        (interactions.bookmarks?.users?.some(u => u.user?.toString() === userId.toString()) || false) : 
        false,
      isBookmarked: userId ? 
        (interactions.bookmarks?.users?.some(u => u.user?.toString() === userId.toString()) || false) : 
        false
    };
  }

  /**
   * Check if user has voted on political orientation
   * @param {Object} post - Post document with politicalOrientation
   * @param {String} userId - Current user ID
   * @returns {Boolean} Whether the user has voted
   */
  static hasVotedPolitical(post, userId = null) {
    if (!userId || !post.politicalOrientation?.voters) {
      return false;
    }
    
    return post.politicalOrientation.voters.some(
      voter => voter.userId?.toString() === userId.toString()
    );
  }
}

module.exports = ResponseHelper;
