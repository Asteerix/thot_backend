/* eslint-disable */
const User = require('../models/user.model');
const Post = require('../models/post.model');
const Short = require('../models/short.model');
const { buildMediaUrl } = require('../utils/urlHelper');
const NotificationService = require('../services/notification.service');

// Get user's saved posts
exports.getSavedPosts = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    // First get the user with their saved posts IDs
    const user = await User.findById(req.user._id);

    // Handle case where interactions might be null or undefined
    // Use bookmarks as primary, fall back to savedPosts for backward compatibility
    const savedPostIds = user?.interactions?.bookmarks || user?.interactions?.savedPosts || [];
    const total = savedPostIds.length;

    if (total === 0) {
      return res.json({
        success: true,
        data: {
          posts: [],
          total: 0,
          page: parseInt(page),
          pages: 0
        }
      });
    }

    // Calculate pagination
    const skip = (page - 1) * parseInt(limit);
    const paginatedIds = savedPostIds.slice(skip, skip + parseInt(limit));

    // Now fetch the actual posts with their details
    const posts = await Post.find({ _id: { $in: paginatedIds } })
      .populate('journalist', '_id name username avatarUrl organization isVerified stats')
      .sort({ createdAt: -1 });

    // Transform posts to ensure _id is included as a string
    const transformedPosts = posts.map(post => {
      const postObj = post.toObject();
      // Ensure _id is always included as a string
      postObj._id = post._id.toString();

      // Format interactions to match Flutter model expectations
      postObj.interactions = {
        likes: post.interactions?.likes?.count || 0,
        dislikes: post.interactions?.dislikes?.count || 0,
        comments: post.interactions?.comments?.count || 0,
        reports: post.interactions?.reports?.count || 0,
        bookmarks: post.interactions?.bookmarks?.count || 0,
        isLiked: req.user
          ? post.interactions?.likes?.users?.some(
            u => u.user && u.user.toString() === req.user._id.toString()
          ) || false
          : false,
        isBookmarked: true, // This is a saved post, so it's bookmarked
        isSaved: true // Ensure isSaved is true for saved posts
      };

      // Handle URLs dynamically
      postObj.imageUrl = buildMediaUrl(req, postObj.imageUrl);
      postObj.videoUrl = buildMediaUrl(req, postObj.videoUrl);
      postObj.thumbnailUrl = buildMediaUrl(req, postObj.thumbnailUrl);

      // Handle journalist URLs
      if (postObj.journalist && postObj.journalist.avatarUrl) {
        postObj.journalist.avatarUrl = buildMediaUrl(req, postObj.journalist.avatarUrl);
      }

      return postObj;
    });

    res.json({
      success: true,
      data: {
        posts: transformedPosts,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to fetch saved posts',
      error: error.message
    });
  }
};

// Get user's saved shorts
exports.getSavedShorts = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    // Find all shorts where current user is in bookmarks array
    const query = {
      'interactions.bookmarks.users.user': req.user._id,
      isDeleted: { $ne: true },
      type: 'short'
    };

    const total = await Post.countDocuments(query);

    if (total === 0) {
      return res.json({
        success: true,
        data: {
          shorts: [],
          total: 0,
          page: parseInt(page),
          pages: 0
        }
      });
    }

    const shorts = await Post.find(query)
      .populate('journalist', '_id name username avatarUrl profileImage verified isVerified')
      .sort({ createdAt: -1 })
      .skip((page - 1) * parseInt(limit))
      .limit(parseInt(limit));

    // Transform shorts to ensure URLs are complete
    const transformedShorts = shorts.map(short => {
      const shortObj = short.toObject();

      // Ensure _id is included as string
      shortObj.id = shortObj._id.toString();

      // Handle URLs dynamically
      shortObj.imageUrl = buildMediaUrl(req, shortObj.imageUrl);
      shortObj.videoUrl = buildMediaUrl(req, shortObj.videoUrl);
      shortObj.thumbnailUrl = buildMediaUrl(req, shortObj.thumbnailUrl);

      // Handle journalist URLs (using journalist field from Post model)
      if (shortObj.journalist && shortObj.journalist.avatarUrl) {
        shortObj.journalist.avatarUrl = buildMediaUrl(req, shortObj.journalist.avatarUrl);
      }
      if (shortObj.journalist && shortObj.journalist.profileImage) {
        shortObj.journalist.profileImage = buildMediaUrl(req, shortObj.journalist.profileImage);
      }

      return shortObj;
    });

    res.json({
      success: true,
      data: {
        shorts: transformedShorts,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to fetch saved shorts',
      error: error.message
    });
  }
};

// Get user's read history
exports.getReadHistory = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const user = await User.findById(req.user._id)
      .populate({
        path: 'interactions.readHistory.post',
        populate: {
          path: 'journalist',
          model: 'Journalist',
          select: 'name username avatarUrl organization isVerified stats'
        },
        options: {
          skip: (page - 1) * limit,
          limit: parseInt(limit),
          sort: { readAt: -1 }
        }
      });

    // Handle case where interactions might be null or undefined
    const readHistory = user?.interactions?.readHistory || [];
    const total = readHistory.length;

    res.json({
      success: true,
      data: {
        history: readHistory,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to fetch read history',
      error: error.message
    });
  }
};

// Get user's followed journalists
exports.getFollowedJournalists = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const user = await User.findById(req.user._id)
      .populate({
        path: 'followedJournalists',
        model: 'Journalist',
        select: 'name username avatarUrl organization isVerified stats followers',
        options: {
          skip: (page - 1) * limit,
          limit: parseInt(limit),
          sort: { 'stats.postsCount': -1 }
        }
      });

    const total = user.followedJournalists.length;

    res.json({
      success: true,
      data: {
        journalists: user.followedJournalists.map(j => ({
          ...j.toObject(),
          isFollowing: true,
          followersCount: j.followers.length
        })),
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to fetch followed journalists',
      error: error.message
    });
  }
};

// Update user preferences
exports.updatePreferences = async (req, res) => {
  try {
    const allowedUpdates = ['topics', 'notifications', 'darkMode'];
    const updates = Object.keys(req.body);

    const isValidOperation = updates.every(update =>
      allowedUpdates.includes(update));

    if (!isValidOperation) {
      return res.status(400).json({
        success: false,
        message: 'Invalid updates'
      });
    }

    updates.forEach(update => {
      req.user.preferences[update] = req.body[update];
    });

    await req.user.save();

    res.json({
      success: true,
      data: {
        preferences: req.user.preferences
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to update preferences',
      error: error.message
    });
  }
};

// Get user's public content
exports.getPublicContent = async (req, res) => {
  try {
    const { type = 'all' } = req.query;
    const user = await User.findById(req.params.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Only show public content for regular users (not journalists)
    if (user.role === 'journalist') {
      return res.status(400).json({
        success: false,
        message: 'This endpoint is only for regular users'
      });
    }

    let publicContent = {};

    if (type === 'all' || type === 'posts') {
      const posts = await Post.find({
        _id: { $in: user.interactions?.publicContent?.posts || [] }
      })
        .populate('journalist', '_id name username avatarUrl organization isVerified')
        .sort({ createdAt: -1 });

      publicContent.posts = posts.map(post => {
        const postObj = post.toObject();
        postObj._id = post._id.toString();
        postObj.imageUrl = buildMediaUrl(req, postObj.imageUrl);
        postObj.videoUrl = buildMediaUrl(req, postObj.videoUrl);
        postObj.thumbnailUrl = buildMediaUrl(req, postObj.thumbnailUrl);
        if (postObj.journalist && postObj.journalist.avatarUrl) {
          postObj.journalist.avatarUrl = buildMediaUrl(req, postObj.journalist.avatarUrl);
        }
        return postObj;
      });
    }

    if (type === 'all' || type === 'shorts') {
      const shorts = await Short.find({
        _id: { $in: user.interactions?.publicContent?.shorts || [] }
      })
        .populate('author', 'name username avatarUrl profileImage isVerified')
        .sort({ createdAt: -1 });

      publicContent.shorts = shorts.map(short => {
        const shortObj = short.toObject();
        shortObj.id = shortObj._id.toString();
        shortObj.imageUrl = buildMediaUrl(req, shortObj.imageUrl);
        shortObj.videoUrl = buildMediaUrl(req, shortObj.videoUrl);
        shortObj.thumbnailUrl = buildMediaUrl(req, shortObj.thumbnailUrl);
        if (shortObj.author && shortObj.author.avatarUrl) {
          shortObj.author.avatarUrl = buildMediaUrl(req, shortObj.author.avatarUrl);
        }
        return shortObj;
      });
    }

    if (type === 'all' || type === 'questions') {
      const questions = await Post.find({
        _id: { $in: user.interactions?.publicContent?.questions || [] },
        type: 'question'
      })
        .populate('journalist', '_id name username avatarUrl organization isVerified')
        .sort({ createdAt: -1 });

      publicContent.questions = questions.map(question => {
        const questionObj = question.toObject();
        questionObj._id = question._id.toString();
        if (questionObj.journalist && questionObj.journalist.avatarUrl) {
          questionObj.journalist.avatarUrl = buildMediaUrl(req, questionObj.journalist.avatarUrl);
        }
        return questionObj;
      });
    }

    res.json({
      success: true,
      data: publicContent
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to fetch public content',
      error: error.message
    });
  }
};

// Toggle content as public/private
exports.togglePublicContent = async (req, res) => {
  try {
    const { contentId, contentType, isPublic } = req.body;

    if (!contentId || !contentType) {
      return res.status(400).json({
        success: false,
        message: 'Content ID and type are required'
      });
    }

    if (!['posts', 'shorts', 'questions'].includes(contentType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid content type'
      });
    }

    const user = await User.findById(req.user._id);

    // Initialize publicContent if it doesn't exist
    if (!user.interactions.publicContent) {
      user.interactions.publicContent = {
        posts: [],
        shorts: [],
        questions: []
      };
    }

    const publicContentArray = user.interactions.publicContent[contentType];
    const contentIndex = publicContentArray.findIndex(id => id.toString() === contentId);

    if (isPublic && contentIndex === -1) {
      // Add to public content
      publicContentArray.push(contentId);
    } else if (!isPublic && contentIndex !== -1) {
      // Remove from public content
      publicContentArray.splice(contentIndex, 1);
    }

    await user.save();

    res.json({
      success: true,
      message: isPublic ? 'Content made public' : 'Content made private',
      data: {
        contentId,
        contentType,
        isPublic
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to toggle content visibility',
      error: error.message
    });
  }
};

// Follow a journalist
exports.followJournalist = async (req, res) => {
  try {
    // Check if trying to follow self
    if (req.user._id.toString() === req.params.journalistId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot follow yourself'
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Find the journalist to follow
    const journalist = await User.findById(req.params.journalistId);
    if (!journalist) {
      return res.status(404).json({
        success: false,
        message: 'Journalist not found'
      });
    }

    // Check if already following
    if (user.following.includes(req.params.journalistId)) {
      return res.status(400).json({
        success: false,
        message: 'Already following this journalist'
      });
    }

    // Add to following list
    user.following.push(req.params.journalistId);
    await user.save();

    // Add to journalist's followers list
    if (!journalist.followers.includes(req.user._id)) {
      journalist.followers.push(req.user._id);
      await journalist.save();
    }

    // Update stats
    await User.updateOne(
      { _id: req.user._id },
      { $set: { 'stats.following': user.following.length } }
    );
    await User.updateOne(
      { _id: req.params.journalistId },
      { $set: { 'stats.followers': journalist.followers.length } }
    );

    // Send follow notification (non-blocking)
    NotificationService.notifyFollow(req.user._id, req.params.journalistId).catch(err => {
      console.error('[FOLLOW] Notification error:', err);
    });

    res.json({
      success: true,
      message: 'Vous suivez maintenant ce journaliste',
      data: {
        isFollowing: true,
        followersCount: journalist.followers.length
      }
    });
  } catch (error) {
    console.error('Follow journalist error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to follow journalist',
      error: error.message
    });
  }
};

// Unfollow a journalist
exports.unfollowJournalist = async (req, res) => {
  try {
    // Check if trying to unfollow self
    if (req.user._id.toString() === req.params.journalistId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot unfollow yourself'
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Find the journalist to unfollow
    const journalist = await User.findById(req.params.journalistId);
    if (!journalist) {
      return res.status(404).json({
        success: false,
        message: 'Journalist not found'
      });
    }

    // Check if not following
    if (!user.following.includes(req.params.journalistId)) {
      return res.status(400).json({
        success: false,
        message: 'Not following this journalist'
      });
    }

    // Remove from following list
    user.following = user.following.filter(id => id.toString() !== req.params.journalistId);
    await user.save();

    // Remove from journalist's followers list
    journalist.followers = journalist.followers.filter(id => id.toString() !== req.user._id.toString());
    await journalist.save();

    // Update stats
    await User.updateOne(
      { _id: req.user._id },
      { $set: { 'stats.following': user.following.length } }
    );
    await User.updateOne(
      { _id: req.params.journalistId },
      { $set: { 'stats.followers': journalist.followers.length } }
    );

    res.json({
      success: true,
      message: 'Vous ne suivez plus ce journaliste',
      data: {
        isFollowing: false,
        followersCount: journalist.followers.length
      }
    });
  } catch (error) {
    console.error('Unfollow journalist error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to unfollow journalist',
      error: error.message
    });
  }
};

// Get follow status for a journalist
exports.getFollowStatus = async (req, res) => {
  try {
    const journalist = await Journalist.findById(req.params.journalistId);

    if (!journalist) {
      return res.status(404).json({
        success: false,
        message: 'Journalist not found'
      });
    }

    const isFollowing = journalist.followers.some(
      id => id.toString() === req.user._id.toString()
    );

    const followingSince = isFollowing ?
      new Date().toISOString() : null; // In a real implementation, store the actual follow date

    res.json({
      success: true,
      data: {
        isFollowing,
        followingSince,
        notifications: true // Default to true, can be customized later
      }
    });
  } catch (error) {
    console.error('Follow status check error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to check follow status',
      error: error.message
    });
  }
};

// Get user's statistics
exports.getStats = async (req, res) => {
  try {
    // Initialize interactions if not exists
    if (!req.user.interactions) {
      req.user.interactions = {
        followedJournalists: [],
        bookmarks: [],
        savedPosts: [], // Backward compatibility
        readHistory: []
      };
    }

    const stats = {
      // Use bookmarks as primary, fall back to savedPosts
      savedPosts: req.user.interactions.bookmarks?.length || req.user.interactions.savedPosts?.length || 0,
      bookmarks: req.user.interactions.bookmarks?.length || req.user.interactions.savedPosts?.length || 0,
      followedJournalists: req.user.interactions.followedJournalists?.length || 0,
      readArticles: req.user.interactions.readHistory?.length || 0,
      ...req.user.stats
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Stats fetch error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to fetch user statistics',
      error: error.message
    });
  }
};

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const allowedUpdates = ['avatarUrl', 'coverUrl', 'name'];
    const updates = Object.keys(req.body);

    const isValidOperation = updates.every(update => allowedUpdates.includes(update));
    if (!isValidOperation) {
      return res.status(400).json({
        success: false,
        message: 'Invalid updates'
      });
    }

    // Use authenticated user directly from req.user
    const user = req.user;

    // Additional check to ensure user is updating their own profile
    if (user._id.toString() !== req.params.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this profile'
      });
    }

    updates.forEach(update => {
      user[update] = req.body[update];
    });
    await user.save();

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to update user',
      error: error.message
    });
  }
};

// Get user profile by ID
exports.getProfile = async (req, res) => {
  try {
    // First try to find in User collection
    let user = await User.findById(req.params.id);

    // If not found in User collection, try Journalist collection
    if (!user) {
      const journalist = await Journalist.findById(req.params.id);
      if (journalist) {
        // Convert journalist to user-like profile
        const profileData = {
          id: journalist._id,
          username: journalist.username,
          name: journalist.name,
          avatarUrl: journalist.avatarUrl,
          coverUrl: journalist.coverUrl,
          bio: journalist.bio,
          location: journalist.location,
          role: 'journalist',
          type: 'journalist',
          isJournalist: true,
          organization: journalist.organization,
          isVerified: journalist.isVerified || false,
          specialties: journalist.specialties || [],
          journalistRole: journalist.journalistRole || 'journalist',
          socialLinks: journalist.socialLinks || {},
          formations: journalist.formations || [],
          experience: journalist.experience || [],
          stats: journalist.stats || {
            postes: 0,
            followers: 0,
            following: 0
          },
          followersCount: journalist.followersCount || 0,
          status: journalist.status || 'active'
        };

        return res.json({
          success: true,
          data: profileData
        });
      }

      // If not found in either collection
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const profileData = user.getPublicProfile(req.user);

    res.json({
      success: true,
      data: profileData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get user profile',
      error: error.message
    });
  }
};

exports.updateJournalistCard = async (req, res) => {
  try {
    const { pressCard } = req.body;

    if (!pressCard || typeof pressCard !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Le numéro de carte de presse est requis'
      });
    }

    if (!/^\d{4,}$/.test(pressCard)) {
      return res.status(400).json({
        success: false,
        message: 'Le numéro de carte de presse doit contenir au moins 4 chiffres'
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    if (user.role !== 'journalist') {
      return res.status(403).json({
        success: false,
        message: 'Seuls les journalistes peuvent ajouter une carte de presse'
      });
    }

    user.pressCard = pressCard;
    await user.save();

    res.json({
      success: true,
      message: 'Carte de presse mise à jour avec succès',
      data: {
        pressCard: user.pressCard
      }
    });
  } catch (error) {
    console.error('[USER] Error updating journalist card:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour de la carte de presse',
      error: error.message
    });
  }
};

exports.deleteJournalistCard = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    if (user.role !== 'journalist') {
      return res.status(403).json({
        success: false,
        message: 'Seuls les journalistes peuvent supprimer une carte de presse'
      });
    }

    user.pressCard = null;
    await user.save();

    res.json({
      success: true,
      message: 'Carte de presse supprimée avec succès'
    });
  } catch (error) {
    console.error('[USER] Error deleting journalist card:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression de la carte de presse',
      error: error.message
    });
  }
};

exports.getFollowers = async (req, res) => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('[FOLLOWERS] Get followers request:', {
    userId: req.params.id,
    page: req.query.page,
    limit: req.query.limit,
    timestamp: new Date().toISOString()
  });
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;

    console.log('[FOLLOWERS] Finding user...');
    const user = await User.findById(id)
      .populate({
        path: 'followers',
        select: 'name username avatarUrl organization isVerified role followersCount followingCount bio'
      });

    if (!user) {
      console.log('[FOLLOWERS] ❌ User not found:', id);
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    console.log('[FOLLOWERS] ✅ User found:', {
      userId: user._id,
      username: user.username,
      totalFollowers: user.followers?.length || 0
    });

    const allFollowers = user.followers || [];
    const total = allFollowers.length;
    const skip = (page - 1) * parseInt(limit);
    const paginatedFollowers = allFollowers.slice(skip, skip + parseInt(limit));
    const followers = paginatedFollowers.map(follower => {
      const avatarUrl = follower.avatarUrl && follower.avatarUrl.trim()
        ? buildMediaUrl(req, follower.avatarUrl)
        : null;

      return {
        id: follower._id.toString(),
        _id: follower._id.toString(),
        name: follower.name,
        username: follower.username,
        avatarUrl: avatarUrl,
        organization: follower.organization,
        isVerified: follower.isVerified,
        isJournalist: follower.role === 'journalist',
        type: follower.role === 'journalist' ? 'journalist' : 'regular',
        followersCount: follower.followersCount || 0,
        followingCount: follower.followingCount || 0
      };
    });

    console.log('[FOLLOWERS] ✅ Returning followers:', {
      count: followers.length,
      total: total,
      page: parseInt(page)
    });

    res.json({
      success: true,
      data: {
        followers,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('[FOLLOWERS] ❌ Error getting followers:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des abonnés',
      error: error.message
    });
  }
};

exports.getFollowing = async (req, res) => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('[FOLLOWING] Get following request:', {
    userId: req.params.id,
    page: req.query.page,
    limit: req.query.limit,
    timestamp: new Date().toISOString()
  });
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;

    console.log('[FOLLOWING] Finding user...');
    const user = await User.findById(id)
      .populate({
        path: 'following',
        select: 'name username avatarUrl organization isVerified role followersCount followingCount specialties bio',
        options: {
          skip: (page - 1) * parseInt(limit),
          limit: parseInt(limit)
        }
      });

    if (!user) {
      console.log('[FOLLOWING] ❌ User not found:', id);
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    console.log('[FOLLOWING] ✅ User found:', {
      userId: user._id,
      username: user.username,
      hasFollowingField: user.following !== undefined,
      followingType: typeof user.following,
      followingValue: user.following,
      totalFollowing: user.following?.length || 0
    });

    const following = (user.following || []).map(journalist => {
      const avatarUrl = journalist.avatarUrl && journalist.avatarUrl.trim()
        ? buildMediaUrl(req, journalist.avatarUrl)
        : null;

      return {
        id: journalist._id.toString(),
        _id: journalist._id.toString(),
        name: journalist.name,
        username: journalist.username,
        avatarUrl: avatarUrl,
        organization: journalist.organization,
        isVerified: journalist.isVerified,
        isJournalist: true,
        type: 'journalist',
        followersCount: journalist.followersCount || 0,
        followingCount: journalist.followingCount || 0,
        specialties: journalist.specialties || []
      };
    });

    const total = following.length;

    console.log('[FOLLOWING] ✅ Returning following:', {
      count: following.length,
      total: total,
      page: parseInt(page)
    });

    res.json({
      success: true,
      data: {
        following,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.log('[FOLLOWING] ❌ Error getting following:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des abonnements',
      error: error.message
    });
  }
};

module.exports = {
  getSavedPosts: exports.getSavedPosts,
  getSavedShorts: exports.getSavedShorts,
  getReadHistory: exports.getReadHistory,
  getFollowedJournalists: exports.getFollowedJournalists,
  updatePreferences: exports.updatePreferences,
  getPublicContent: exports.getPublicContent,
  togglePublicContent: exports.togglePublicContent,
  followJournalist: exports.followJournalist,
  unfollowJournalist: exports.unfollowJournalist,
  getFollowStatus: exports.getFollowStatus,
  getStats: exports.getStats,
  updateProfile: exports.updateProfile,
  getProfile: exports.getProfile,
  updateJournalistCard: exports.updateJournalistCard,
  deleteJournalistCard: exports.deleteJournalistCard,
  getFollowers: exports.getFollowers,
  getFollowing: exports.getFollowing
};