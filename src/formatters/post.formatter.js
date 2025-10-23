const { buildMediaUrl } = require('../utils/urlHelper');
const { formatUser } = require('./user.formatter');

/**
 * Format post interactions to include counts and user-specific flags
 */
const formatInteractions = (interactions, currentUserId = null) => {
  if (!interactions) {
    return {
      likes: 0,
      dislikes: 0,
      comments: 0,
      bookmarks: 0,
      isLiked: false,
      isDisliked: false,
      isBookmarked: false
    };
  }

  const result = {
    likes: interactions.likes?.count || 0,
    dislikes: interactions.dislikes?.count || 0,
    comments: interactions.comments?.count || 0,
    bookmarks: interactions.bookmarks?.count || 0,
    isLiked: false,
    isDisliked: false,
    isBookmarked: false
  };

  if (currentUserId) {
    result.isLiked = interactions.likes?.users?.some(
      u => u.user?.toString() === currentUserId.toString()
    ) || false;

    result.isDisliked = interactions.dislikes?.users?.some(
      u => u.user?.toString() === currentUserId.toString()
    ) || false;

    result.isBookmarked = interactions.bookmarks?.users?.some(
      u => u.user?.toString() === currentUserId.toString()
    ) || false;
  }

  return result;
};

/**
 * Format political orientation data with dominant view
 */
const formatPoliticalOrientation = (politicalOrientation, currentUserId = null) => {
  if (!politicalOrientation) {
    return null;
  }

  const userVotes = politicalOrientation.userVotes || {};
  const voters = politicalOrientation.voters || [];

  // Calculate dominant view (most votes)
  let dominantView = null;
  let maxVotes = 0;

  Object.entries(userVotes).forEach(([view, count]) => {
    if (count > maxVotes) {
      maxVotes = count;
      dominantView = view;
    }
  });

  // Check if current user has voted
  const hasVoted = currentUserId ? voters.some(
    v => v.userId?.toString() === currentUserId.toString()
  ) : false;

  return {
    journalistChoice: politicalOrientation.journalistChoice,
    userVotes,
    finalScore: politicalOrientation.finalScore || 0,
    dominantView,
    hasVoted
  };
};

/**
 * Format post metadata based on post type
 */
const formatMetadata = (metadata, type) => {
  if (!metadata || !metadata[type]) {
    return null;
  }

  return metadata[type];
};

/**
 * Format a single post with all necessary transformations
 */
const formatPost = (post, req, currentUser = null) => {
  if (!post) {
    return null;
  }

  const postObj = post.toObject ? post.toObject() : { ...post };
  const currentUserId = currentUser?._id;

  // Format media URLs
  postObj.imageUrl = buildMediaUrl(req, postObj.imageUrl);
  postObj.thumbnailUrl = buildMediaUrl(req, postObj.thumbnailUrl);
  postObj.videoUrl = buildMediaUrl(req, postObj.videoUrl);

  // Format journalist/author
  if (postObj.journalist) {
    postObj.journalist = formatUser(postObj.journalist, req, currentUser);
  }

  // Format interactions
  postObj.interactions = formatInteractions(postObj.interactions, currentUserId);

  // Format political orientation
  postObj.politicalOrientation = formatPoliticalOrientation(
    postObj.politicalOrientation,
    currentUserId
  );

  // Format metadata based on type
  if (postObj.metadata) {
    postObj.metadata = formatMetadata(postObj.metadata, postObj.type);
  }

  // Format opposition posts
  if (postObj.opposingPosts) {
    postObj.opposingPosts = postObj.opposingPosts.map(opp => {
      if (opp.postId && typeof opp.postId === 'object') {
        return {
          postId: opp.postId._id,
          title: opp.postId.title,
          imageUrl: buildMediaUrl(req, opp.postId.imageUrl),
          description: opp.description
        };
      }
      return opp;
    });
  }

  if (postObj.opposedByPosts) {
    postObj.opposedByPosts = postObj.opposedByPosts.map(opp => {
      if (opp.postId && typeof opp.postId === 'object') {
        return {
          postId: opp.postId._id,
          title: opp.postId.title,
          imageUrl: buildMediaUrl(req, opp.postId.imageUrl),
          description: opp.description
        };
      }
      return opp;
    });
  }

  // Format related posts
  if (postObj.relatedPosts && Array.isArray(postObj.relatedPosts)) {
    postObj.relatedPosts = postObj.relatedPosts
      .filter(rp => rp && rp._id)
      .map(rp => formatPost(rp, req, currentUser));
  }

  return postObj;
};

/**
 * Format multiple posts
 */
const formatPosts = (posts, req, currentUser = null) => {
  if (!Array.isArray(posts)) {
    return [];
  }

  return posts.map(post => formatPost(post, req, currentUser));
};

module.exports = {
  formatPost,
  formatPosts,
  formatInteractions,
  formatPoliticalOrientation,
  formatMetadata
};