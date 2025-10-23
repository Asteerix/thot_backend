/**
 * Helper functions for post controllers
 */

const mongoose = require('mongoose');
const { buildMediaUrl } = require('../../utils/urlHelper');
const {
  POLITICAL_VIEW_COLORS,
  POLITICAL_ORIENTATION
} = require('../../constants/post.constants');

/**
 * Get color for political view based on orientation
 * @param {string} view - Political orientation view
 * @returns {string} - Hex color code
 */
function getPoliticalViewColor(view) {
  return POLITICAL_VIEW_COLORS[view] || POLITICAL_VIEW_COLORS[POLITICAL_ORIENTATION.NEUTRAL];
}

/**
 * Validate ObjectId
 */
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/**
 * Format post for response
 */
function formatPostResponse(post, req, currentUserId = null) {
  const postObj = post.toObject ? post.toObject() : { ...post };

  // Format media URLs
  if (postObj.imageUrl) {
    postObj.imageUrl = buildMediaUrl(req, postObj.imageUrl);
  }
  if (postObj.thumbnailUrl) {
    postObj.thumbnailUrl = buildMediaUrl(req, postObj.thumbnailUrl);
  }
  if (postObj.videoUrl) {
    postObj.videoUrl = buildMediaUrl(req, postObj.videoUrl);
  }

  // Format journalist
  if (postObj.journalist) {
    const journalist = postObj.journalist.toObject ? postObj.journalist.toObject() : postObj.journalist;
    postObj.journalist = {
      id: journalist._id,
      name: journalist.name || journalist.username,
      avatarUrl: journalist.avatarUrl ? buildMediaUrl(req, journalist.avatarUrl) : null,
      verified: journalist.isVerified || journalist.verified || false,
      isVerified: journalist.isVerified || journalist.verified || false,
      organization: journalist.organization || '',
      specialties: journalist.specialties || []
    };
  }

  // Format interactions
  if (currentUserId && postObj.interactions) {
    postObj.interactions.isLiked = postObj.interactions.likes?.users?.some(
      u => u.user?.toString() === currentUserId.toString()
    ) || false;

    postObj.interactions.isDisliked = postObj.interactions.dislikes?.users?.some(
      u => u.user?.toString() === currentUserId.toString()
    ) || false;

    postObj.interactions.isBookmarked = postObj.interactions.bookmarks?.users?.some(
      u => u.user?.toString() === currentUserId.toString()
    ) || false;
  }

  return postObj;
}

/**
 * Calculate dominant political view from user votes
 * @param {Object} userVotes - Object containing vote counts per orientation
 * @returns {string|null} - Dominant view or null if no votes
 */
function calculateDominantView(userVotes) {
  if (!userVotes) {
    return null;
  }

  let maxVotes = 0;
  let dominantView = null;

  Object.entries(userVotes).forEach(([view, count]) => {
    if (count > maxVotes) {
      maxVotes = count;
      dominantView = view;
    }
  });

  return dominantView;
}

/**
 * Calculate total votes from userVotes object
 * @param {Object} userVotes - Object containing vote counts per orientation
 * @returns {number} - Total number of votes
 */
function calculateTotalVotes(userVotes) {
  if (!userVotes) {
    return 0;
  }

  return Object.values(userVotes).reduce((total, count) => total + count, 0);
}

/**
 * Calculate median political orientation from vote frequencies
 * @param {Object} userVotes - Object containing vote counts per orientation
 * @returns {number} - Median score (-2 to +2)
 */
function calculateMedianOrientation(userVotes) {
  const { SCORE_TO_ORIENTATION } = require('../../constants/post.constants');

  // Build frequency array
  const frequencies = [-2, -1, 0, 1, 2].map(score => {
    const view = SCORE_TO_ORIENTATION[score.toString()];
    return userVotes[view] || 0;
  });

  const totalVotes = frequencies.reduce((sum, freq) => sum + freq, 0);

  // Default to neutral if no votes
  if (totalVotes === 0) {
    return 0;
  }

  const medianPosition = totalVotes / 2;
  let cumulative = 0;
  let medianIndex = -1;

  // Find the index where cumulative count exceeds median position
  for (let i = 0; i < frequencies.length; i++) {
    cumulative += frequencies[i];
    if (cumulative > medianPosition) {
      medianIndex = i;
      break;
    } else if (cumulative === medianPosition && totalVotes % 2 === 0) {
      // For even total, find next non-zero frequency for average
      for (let j = i + 1; j < frequencies.length; j++) {
        if (frequencies[j] > 0) {
          const score1 = i - 2;
          const score2 = j - 2;
          const avgScore = (score1 + score2) / 2;
          // Round towards neutral for ties
          return avgScore > 0 ? Math.floor(avgScore) : Math.ceil(avgScore);
        }
      }
      if (medianIndex === -1) {
        medianIndex = i;
      }
      break;
    }
  }

  if (medianIndex >= 0) {
    return medianIndex - 2; // Convert index to score (-2 to +2)
  }

  return 0; // Default to neutral
}

/**
 * Initialize post political orientation structure
 * @returns {Object} - Initialized political orientation object
 */
function initializePoliticalOrientation() {
  const { POLITICAL_ORIENTATION } = require('../../constants/post.constants');

  return {
    userVotes: {
      [POLITICAL_ORIENTATION.EXTREMELY_CONSERVATIVE]: 0,
      [POLITICAL_ORIENTATION.CONSERVATIVE]: 0,
      [POLITICAL_ORIENTATION.NEUTRAL]: 0,
      [POLITICAL_ORIENTATION.PROGRESSIVE]: 0,
      [POLITICAL_ORIENTATION.EXTREMELY_PROGRESSIVE]: 0
    },
    journalistChoice: POLITICAL_ORIENTATION.NEUTRAL,
    finalScore: 0,
    voters: []
  };
}

/**
 * Check if user has already liked a post
 * @param {Object} post - Post document
 * @param {string} userId - User ID to check
 * @returns {boolean} - True if user has liked the post
 */
function hasUserLiked(post, userId) {
  if (!post.interactions?.likes?.users || !userId) {
    return false;
  }

  return post.interactions.likes.users.some(
    u => u.user && u.user.toString() === userId.toString()
  );
}

/**
 * Check if user has bookmarked a post
 * @param {Object} post - Post document
 * @param {string} userId - User ID to check
 * @returns {boolean} - True if user has bookmarked the post
 */
function hasUserBookmarked(post, userId) {
  if (!post.interactions?.bookmarks?.users || !userId) {
    return false;
  }

  return post.interactions.bookmarks.users.some(
    u => u.user && u.user.toString() === userId.toString()
  );
}

module.exports = {
  getPoliticalViewColor,
  isValidObjectId,
  formatPostResponse,
  calculateDominantView,
  calculateTotalVotes,
  calculateMedianOrientation,
  initializePoliticalOrientation,
  hasUserLiked,
  hasUserBookmarked
};