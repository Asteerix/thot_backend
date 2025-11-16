const Post = require('../models/post.model');
const User = require('../models/user.model');
const NotificationService = require('../services/notification.service');
const socketService = require('../services/socket.service');
const { clearCache } = require('../middleware/cache.middleware');
const ResponseHelper = require('../utils/responseHelper');

// Helper function to get political view color
const getPoliticalViewColor = (view) => {
  const colors = {
    extremelyConservative: '#8B0000',
    extremely_conservative: '#8B0000', // backward compatibility
    conservative: '#DC143C',
    neutral: '#808080',
    progressive: '#4169E1',
    extremelyProgressive: '#0000CD',
    extremely_progressive: '#0000CD' // backward compatibility
  };
  return colors[view] || '#808080';
};

/**
 * Toggle like on a post using atomic operations
 */
exports.toggleLike = async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user._id;

    console.log('[LIKE] Toggle attempt:', {
      postId,
      userId,
      timestamp: new Date().toISOString()
    });

    // Check if post exists
    const post = await Post.findById(postId);
    if (!post || post.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Check if user has already liked
    const hasLiked = post.interactions?.likes?.users?.some(
      (u) => u.user?.toString() === userId.toString()
    );

    let updatedPost;

    if (hasLiked) {
      // Remove like atomically
      updatedPost = await Post.findByIdAndUpdate(
        postId,
        {
          $pull: { 'interactions.likes.users': { user: userId } },
          $inc: { 'interactions.likes.count': -1 }
        },
        { new: true }
      );

      console.log('[LIKE] Removed like:', {
        postId,
        userId,
        newCount: updatedPost.interactions.likes.count
      });
    } else {
      // Add like atomically
      updatedPost = await Post.findByIdAndUpdate(
        postId,
        {
          $addToSet: {
            'interactions.likes.users': { user: userId, createdAt: new Date() }
          },
          $inc: { 'interactions.likes.count': 1 }
        },
        { new: true }
      );

      console.log('[LIKE] Added like:', {
        postId,
        userId,
        newCount: updatedPost.interactions.likes.count
      });

      // Send notification (non-blocking)
      process.nextTick(async () => {
        try {
          if (post.journalist) {
            await NotificationService.notifyLike(
              postId,
              userId,
              post.journalist
            );
          }
        } catch (error) {
          console.error('[LIKE] Notification error:', error);
        }
      });
    }

    // Invalidate cache for posts to prevent "ghost likes"
    // Clear all post caches since we don't know all the pages where this post appears
    try {
      clearCache('posts');
      console.log('[LIKE] Cache invalidated after like toggle');
    } catch (cacheError) {
      console.error('[LIKE] Cache invalidation error:', cacheError);
    }

    // Populate journalist and format response
    await updatedPost.populate({
      path: 'journalist',
      select: 'name username avatarUrl isVerified'
    });

    const responseData = updatedPost.toObject();

    // Use helper for consistent format
    responseData.interactions = ResponseHelper.formatInteractions(updatedPost, userId);

    // Broadcast like change via Socket.IO to all subscribed clients
    try {
      socketService.notifyLike(postId, {
        postId,
        userId: userId.toString(),
        isLiked: !hasLiked,
        likeCount: updatedPost.interactions.likes.count,
        timestamp: new Date()
      });
      console.log('[LIKE] Socket.IO notification sent | postId:', postId, 'isLiked:', !hasLiked, 'likeCount:', updatedPost.interactions.likes.count);
    } catch (socketError) {
      console.error('[LIKE] Socket.IO notification error:', socketError);
      // Don't fail the request if socket notification fails
    }

    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('[LIKE] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to toggle like'
    });
  }
};

/**
 * Toggle bookmark on a post using atomic operations
 */
exports.toggleBookmark = async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user._id;

    console.log('[BOOKMARK] Toggle attempt:', {
      postId,
      userId,
      timestamp: new Date().toISOString()
    });

    // Check if post exists
    const post = await Post.findById(postId);
    if (!post || post.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Check if already bookmarked
    const hasBookmarked = post.interactions?.bookmarks?.users?.some(
      (u) => u.user?.toString() === userId.toString()
    );

    let updatedPost;

    if (hasBookmarked) {
      // Remove bookmark atomically
      updatedPost = await Post.findByIdAndUpdate(
        postId,
        {
          $pull: { 'interactions.bookmarks.users': { user: userId } },
          $inc: { 'interactions.bookmarks.count': -1 }
        },
        { new: true }
      );

      // Remove from user's bookmarks (and savedPosts for backward compatibility)
      await User.findByIdAndUpdate(userId, {
        $pull: {
          'interactions.bookmarks': postId,
          'interactions.savedPosts': postId
        }
      });

      console.log('[BOOKMARK] Removed bookmark:', {
        postId,
        userId,
        newCount: updatedPost.interactions.bookmarks.count
      });
    } else {
      // Add bookmark atomically
      updatedPost = await Post.findByIdAndUpdate(
        postId,
        {
          $addToSet: {
            'interactions.bookmarks.users': {
              user: userId,
              createdAt: new Date()
            }
          },
          $inc: { 'interactions.bookmarks.count': 1 }
        },
        { new: true }
      );

      // Add to user's bookmarks (and savedPosts for backward compatibility)
      await User.findByIdAndUpdate(userId, {
        $addToSet: {
          'interactions.bookmarks': postId,
          'interactions.savedPosts': postId
        }
      });

      console.log('[BOOKMARK] Added bookmark:', {
        postId,
        userId,
        newCount: updatedPost.interactions.bookmarks.count
      });
    }

    // Invalidate cache for posts to prevent "ghost bookmarks"
    try {
      clearCache('posts');
      console.log('[BOOKMARK] Cache invalidated after bookmark toggle');
    } catch (cacheError) {
      console.error('[BOOKMARK] Cache invalidation error:', cacheError);
    }

    // Populate journalist and format response
    await updatedPost.populate({
      path: 'journalist',
      select: 'name username avatarUrl isVerified'
    });

    const responseData = updatedPost.toObject();

    // Use helper for consistent format
    responseData.interactions = ResponseHelper.formatInteractions(updatedPost, userId);

    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('[BOOKMARK] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to toggle bookmark'
    });
  }
};

/**
 * Vote on political orientation using atomic operations
 */
exports.votePoliticalOrientation = async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user._id;
    const view = req.body.view || req.body.action;

    console.log('[POLITICAL_VOTE] Vote attempt:', {
      postId,
      userId,
      view,
      timestamp: new Date().toISOString()
    });

    if (!view) {
      return res.status(400).json({
        success: false,
        message: 'Political view is required'
      });
    }

    // Validate view - accept both camelCase and snake_case
    const validViews = [
      'extremely_conservative',
      'extremelyConservative',
      'conservative',
      'neutral',
      'progressive',
      'extremely_progressive',
      'extremelyProgressive'
    ];
    if (!validViews.includes(view)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid political view'
      });
    }

    // Normalize to camelCase for internal use (Post model uses camelCase)
    const normalizedView = view
      .replace('extremely_conservative', 'extremelyConservative')
      .replace('extremely_progressive', 'extremelyProgressive');

    // Use normalized view for all operations
    const viewToUse = normalizedView;

    // Get current post state
    const post = await Post.findById(postId);
    if (!post || post.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Check if user already voted
    const existingVoteIndex =
      post.politicalOrientation?.voters?.findIndex(
        (v) => v.userId?.toString() === userId.toString()
      ) ?? -1;

    let previousView = null;
    const operations = {};

    if (existingVoteIndex !== -1) {
      previousView = post.politicalOrientation.voters[existingVoteIndex].view;

      if (previousView === viewToUse) {
        // Same vote, no change needed
        console.log('[POLITICAL_VOTE] Same vote, no change:', { userId, view: viewToUse });

        await post.populate({
          path: 'journalist',
          select: 'name username avatarUrl isVerified'
        });

        const responseData = post.toObject();
        return res.json({
          success: true,
          data: responseData
        });
      }

      // Remove previous vote
      operations.$inc = {
        [`politicalOrientation.userVotes.${previousView}`]: -1,
        [`politicalOrientation.userVotes.${viewToUse}`]: 1
      };

      // Update voter record
      operations.$set = {
        [`politicalOrientation.voters.${existingVoteIndex}.view`]: viewToUse,
        [`politicalOrientation.voters.${existingVoteIndex}.votedAt`]:
          new Date()
      };
    } else {
      // New vote
      operations.$inc = {
        [`politicalOrientation.userVotes.${viewToUse}`]: 1
      };

      operations.$push = {
        'politicalOrientation.voters': {
          userId,
          view: viewToUse,
          votedAt: new Date()
        }
      };
    }

    // Apply atomic update
    const updatedPost = await Post.findByIdAndUpdate(postId, operations, {
      new: true
    });

    console.log('[POLITICAL_VOTE] Vote updated:', {
      postId,
      userId,
      previousView,
      newView: viewToUse,
      receivedView: view,
      votes: updatedPost.politicalOrientation.userVotes
    });

    // Invalidate cache after political vote
    clearCache('posts');

    // Calculate dominant view
    let maxVotes = 0;
    let dominantView = 'neutral';
    let totalVotes = 0;

    Object.entries(updatedPost.politicalOrientation.userVotes).forEach(
      ([v, count]) => {
        totalVotes += count;
        if (count > maxVotes) {
          maxVotes = count;
          dominantView = v;
        }
      }
    );

    // Populate journalist and format response
    await updatedPost.populate({
      path: 'journalist',
      select: 'name username avatarUrl isVerified'
    });

    const responseData = updatedPost.toObject();
    responseData.politicalOrientation.dominantView = dominantView;
    responseData.politicalOrientation.totalVotes = totalVotes;
    responseData.politicalOrientation.color =
      getPoliticalViewColor(dominantView);

    // Use helper for consistent format
    responseData.interactions = ResponseHelper.formatInteractions(updatedPost, userId);

    // Emit socket event for real-time update
    const socketService = require('../services/socket.service');
    if (socketService.io) {
      socketService.io.to(`post:${postId}`).emit('post:political_vote_updated', {
        postId: postId,
        userVotes: responseData.politicalOrientation.userVotes,
        dominantView: dominantView,
        totalVotes: totalVotes,
        timestamp: new Date()
      });
      console.log('[POLITICAL_VOTE] Socket event emitted to post:' + postId);
    }

    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('[POLITICAL_VOTE] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to vote'
    });
  }
};

module.exports = exports;
