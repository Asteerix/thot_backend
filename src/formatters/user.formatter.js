const { buildMediaUrl } = require('../utils/urlHelper');

/**
 * Format user/journalist with media URLs and consistent structure
 */
const formatUser = (user, req, currentUser = null) => {
  if (!user) {
    return null;
  }

  const userObj = user.toObject ? user.toObject() : { ...user };
  const currentUserId = currentUser?._id;

  // Format media URLs
  userObj.avatarUrl = buildMediaUrl(req, userObj.avatarUrl);
  userObj.coverUrl = buildMediaUrl(req, userObj.coverUrl);

  // Calculate counts
  const followersCount = userObj.followers?.length || 0;
  const followingCount = userObj.following?.length || 0;
  const isJournalist = userObj.role === 'journalist';

  // Check if current user is following this user
  const isFollowing = currentUserId ? userObj.followers?.some(
    id => id.toString() === currentUserId.toString()
  ) : false;

  // Build flat stats structure for mobile compatibility
  const formattedUser = {
    _id: userObj._id, // Keep _id for Flutter compatibility
    id: userObj._id?.toString() || userObj.id, // Ensure id is a string
    username: userObj.username || userObj.name,
    name: userObj.name || userObj.username,
    email: userObj.email,
    avatarUrl: userObj.avatarUrl,
    coverUrl: userObj.coverUrl,
    bio: userObj.bio,
    location: userObj.location,
    role: userObj.role,
    verified: userObj.isVerified,
    isVerified: userObj.isVerified, // Alias for compatibility

    // Flat counts for mobile
    postsCount: isJournalist ? (userObj.stats?.posts || 0) : 0,
    commentsCount: userObj.stats?.commentsCount || 0,
    reactionsCount: userObj.stats?.reactionsCount || 0,
    followersCount,
    followingCount,

    // Social flags
    isFollowing,
    isPrivate: userObj.isPrivate || false,

    // Status
    status: userObj.status,
    lastActive: userObj.lastActive,

    // Type flags
    type: isJournalist ? 'journalist' : 'regular',
    isJournalist
  };

  // Add journalist-specific fields
  if (isJournalist) {
    formattedUser.organization = userObj.organization;
    formattedUser.pressCard = userObj.pressCard;
    formattedUser.journalistRole = userObj.journalistRole;
    formattedUser.specialties = userObj.specialties || [];
    formattedUser.socialLinks = userObj.socialLinks;
    formattedUser.formations = userObj.formations || [];
    formattedUser.experience = userObj.experience || [];
  }

  // Add preferences if available
  if (userObj.preferences) {
    formattedUser.preferences = {
      topics: userObj.preferences.topics || [],
      notifications: userObj.preferences.notifications,
      darkMode: userObj.preferences.darkMode
    };
  }

  // Add highlighted stories
  if (userObj.highlightedStories) {
    formattedUser.highlightedStories = userObj.highlightedStories;
  }

  return formattedUser;
};

/**
 * Format multiple users
 */
const formatUsers = (users, req, currentUser = null) => {
  if (!Array.isArray(users)) {
    return [];
  }

  return users.map(user => formatUser(user, req, currentUser));
};

/**
 * Format user for public profile (minimal data)
 */
const formatPublicUser = (user, req, currentUser = null) => {
  const formatted = formatUser(user, req, currentUser);

  if (!formatted) {
    return null;
  }

  // Remove sensitive fields
  delete formatted.email;
  delete formatted.preferences;

  return formatted;
};

module.exports = {
  formatUser,
  formatUsers,
  formatPublicUser
};