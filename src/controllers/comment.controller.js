const Comment = require('../models/comment.model');
const Post = require('../models/post.model');
const { buildMediaUrl } = require('../utils/urlHelper');
const NotificationService = require('../services/notification.service');
const { clearCache } = require('../middleware/cache.middleware');
const ResponseHelper = require('../utils/responseHelper');
const socketService = require('../services/socket.service');

// Helper function to format comment data
const formatCommentData = (req, commentData) => {
  // Format author avatar URL with default fallback
  if (commentData.author) {
    const defaultAvatar = commentData.author.role === 'journalist'
      ? '/assets/images/defaults/default_journalist_avatar.png'
      : '/assets/images/defaults/default_user_avatar.png';

    commentData.author.avatarUrl = commentData.author.avatarUrl && commentData.author.avatarUrl.trim()
      ? buildMediaUrl(req, commentData.author.avatarUrl)
      : buildMediaUrl(req, defaultAvatar);
  }
  return commentData;
};

exports.createComment = async (req, res) => {
  const isReply = !!req.body.parentComment || !!req.body.parentCommentId;
  const parentId = req.body.parentComment || req.body.parentCommentId || null;

  console.log(`[COMMENT] Creating ${isReply ? 'reply' : 'comment'} | postId: ${req.params.postId}${isReply ? `, parentCommentId: ${parentId}` : ''}`);

  try {
    const post = await Post.findById(req.params.postId);
    if (!post) {
      console.log(`[COMMENT] ❌ Post not found: ${req.params.postId}`);
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    const comment = new Comment({
      content: req.body.content,
      post: req.params.postId,
      author: req.user._id,
      parentComment: parentId
    });

    await comment.save();

    // Update post's comment count atomically
    const updateOps = {
      $inc: { 'interactions.comments.count': 1 }
    };

    // Check if user already commented
    const userIdStr = req.user._id.toString();
    const hasCommented = post.interactions?.comments?.users?.some(
      u => u.user && u.user.toString() === userIdStr
    ) || false;

    if (!hasCommented) {
      updateOps.$addToSet = {
        'interactions.comments.users': {
          user: req.user._id,
          createdAt: new Date()
        }
      };
    }

    await Post.findByIdAndUpdate(req.params.postId, updateOps);

    // Populate author details
    await comment.populate({
      path: 'author',
      select: '_id name fullName username avatarUrl profileImage verified isVerified journalistRole organization'
    });

    // Ensure populate worked
    if (!comment.author || !comment.author._id) {
      const User = require('../models/user.model');
      comment.author = await User.findById(req.user._id)
        .select('_id name fullName username avatarUrl profileImage verified isVerified journalistRole organization');
    }

    // Create notifications
    await NotificationService.notifyComment(post._id, comment._id, req.user._id, post.journalist);

    // If this is a reply to another comment, notify the parent comment author
    if (parentId) {
      const parentComment = await Comment.findById(parentId);

      if (parentComment) {
        // Verify reply relationship
        console.log(`🔗 [COMMENT] Reply linked | id: ${comment._id}, parentComment: ${parentComment._id}, isLinked: true`);

        if (parentComment.author.toString() !== req.user._id.toString()) {
          await NotificationService.createNotification({
            type: 'comment_reply',
            recipient: parentComment.author,
            sender: req.user._id,
            postId: post._id,
            commentId: comment._id,
            message: 'a répondu à votre commentaire',
            entityId: comment._id,
            entityType: 'comment'
          });
        }
      } else {
        console.log(`⚠️ [COMMENT] Parent comment not found: ${parentId}`);
      }
    }

    console.log(`✅ [COMMENT] ${isReply ? 'Reply' : 'Comment'} created | id: ${comment._id}`);

    // Invalidate cache after creating a comment
    clearCache('posts');

    // Get updated post with new comment count
    const updatedPost = await Post.findById(req.params.postId)
      .populate({
        path: 'journalist',
        select: 'name username avatarUrl isVerified'
      });

    // Format post data with simple interactions using ResponseHelper
    const postData = updatedPost.toObject();
    postData.interactions = ResponseHelper.formatInteractions(updatedPost, req.user._id);

    // Use the model's getPublicData method to format the comment correctly
    const publicData = comment.getPublicData(req.user._id);

    // Emit Socket.IO event for real-time comment updates
    socketService.notifyComment(post._id, {
      comment: formatCommentData(req, publicData),
      postId: post._id,
      action: 'created'
    });

    res.status(201).json({
      success: true,
      message: 'Commentaire ajouté',
      data: {
        comment: formatCommentData(req, publicData),
        post: postData
      }
    });
  } catch (error) {
    console.error('[COMMENT] Create comment error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(400).json({
      success: false,
      message: 'Failed to create comment',
      error: error.message
    });
  }
};

exports.getComments = async (req, res) => {
  console.log('[COMMENT] Get comments request:', {
    postId: req.params.postId,
    timestamp: new Date().toISOString()
  });

  try {
    const { page = 1, limit = 20, parentComment = null, sortBy = 'recent' } = req.query;
    const skip = (page - 1) * limit;
    const sort = sortBy === 'popular' ? { 'likes.length': -1, createdAt: -1 } : { createdAt: -1 };

    // Get banned user IDs to exclude their comments
    const User = require('../models/user.model');
    const bannedUsers = await User.find({ status: 'banned' }).select('_id');
    const bannedUserIds = bannedUsers.map(u => u._id);

    const comments = await Comment.find({
      post: req.params.postId,
      parentComment,
      status: 'active',
      isDeleted: { $ne: true },
      ...(bannedUserIds.length > 0 && { author: { $nin: bannedUserIds } })
    })
      .populate({
        path: 'author',
        model: 'User',
        select: '_id name fullName username avatarUrl profileImage verified isVerified journalistRole organization'
      })
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Comment.countDocuments({
      post: req.params.postId,
      parentComment,
      status: 'active',
      isDeleted: { $ne: true },
      ...(bannedUserIds.length > 0 && { author: { $nin: bannedUserIds } })
    });

    const userId = req.user?._id;
    console.log('[COMMENT] Comments fetched successfully:', {
      postId: req.params.postId,
      count: comments.length,
      total,
      userId: userId ? userId.toString() : 'NOT_AUTHENTICATED',
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: {
        comments: await Promise.all(comments.map(async comment => {
          const data = formatCommentData(req, comment.getPublicData(userId));
          console.log('[COMMENT] Comment data:', {
            commentId: comment._id.toString(),
            userId: userId ? userId.toString() : 'NOT_AUTHENTICATED',
            likesCount: comment.likes?.length || 0,
            isLiked: data.isLiked,
            likes: comment.likes?.map(l => l.user.toString()) || []
          });
          // Get reply count
          const replyCount = await Comment.countDocuments({
            parentComment: comment._id,
            status: 'active',
            isDeleted: { $ne: true }
          });
          return { ...data, replyCount };
        })),
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalComments: total
        }
      }
    });
  } catch (error) {
    console.error('[COMMENT] Get comments error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(400).json({
      success: false,
      message: 'Failed to get comments',
      error: error.message
    });
  }
};

exports.getReplies = async (req, res) => {
  console.log('[COMMENT] Get replies request:', {
    commentId: req.params.commentId,
    timestamp: new Date().toISOString()
  });

  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const replies = await Comment.find({
      parentComment: req.params.commentId,
      status: 'active',
      isDeleted: { $ne: true }
    })
      .populate({
        path: 'author',
        model: 'User',
        select: '_id name fullName username avatarUrl profileImage verified isVerified journalistRole organization'
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Comment.countDocuments({
      parentComment: req.params.commentId,
      status: 'active',
      isDeleted: { $ne: true }
    });

    const userId = req.user?._id;
    console.log('[COMMENT] Replies fetched successfully:', {
      commentId: req.params.commentId,
      count: replies.length,
      total,
      userId: userId ? userId.toString() : 'NOT_AUTHENTICATED',
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: {
        replies: replies.map(reply => {
          const data = formatCommentData(req, reply.getPublicData(userId));
          console.log('[COMMENT] Reply data:', {
            replyId: reply._id.toString(),
            userId: userId ? userId.toString() : 'NOT_AUTHENTICATED',
            likesCount: reply.likes?.length || 0,
            isLiked: data.isLiked,
            likes: reply.likes?.map(l => l.user.toString()) || []
          });
          return data;
        }),
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalComments: total
        }
      }
    });
  } catch (error) {
    console.error('[COMMENT] Get replies error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(400).json({
      success: false,
      message: 'Failed to get replies',
      error: error.message
    });
  }
};

exports.updateComment = async (req, res) => {
  console.log('[COMMENT] Update comment attempt:', {
    commentId: req.params.commentId,
    userId: req.user._id,
    timestamp: new Date().toISOString()
  });

  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) {
      console.log('[COMMENT] Update comment failed: Comment not found:', {
        commentId: req.params.commentId
      });
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }

    // Check ownership
    if (comment.author.toString() !== req.user._id.toString()) {
      console.log('[COMMENT] Update comment failed: Not authorized:', {
        commentId: req.params.commentId,
        userId: req.user._id,
        commentAuthorId: comment.author
      });
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this comment'
      });
    }

    comment.content = req.body.content;
    comment.isEdited = true;
    await comment.save();

    // Populate author details for response - always use User model
    await comment.populate({
      path: 'author',
      model: 'User',
      select: '_id name fullName username avatarUrl profileImage verified isVerified journalistRole organization'
    });

    console.log('[COMMENT] Comment updated successfully:', {
      commentId: comment._id,
      timestamp: new Date().toISOString()
    });

    // Emit Socket.IO event for real-time comment update
    socketService.broadcastToRoom(`post:${comment.post}`, 'comment:updated', {
      comment: formatCommentData(req, comment.getPublicData(req.user?._id)),
      postId: comment.post,
      action: 'updated'
    });

    res.json({
      success: true,
      message: 'Commentaire modifié',
      data: formatCommentData(req, comment.getPublicData(req.user?._id))
    });
  } catch (error) {
    console.error('[COMMENT] Update comment error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(400).json({
      success: false,
      message: 'Failed to update comment',
      error: error.message
    });
  }
};

exports.deleteComment = async (req, res) => {
  console.log('[COMMENT] Delete comment attempt:', {
    commentId: req.params.commentId,
    userId: req.user._id,
    timestamp: new Date().toISOString()
  });

  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) {
      console.log('[COMMENT] Delete comment failed: Comment not found:', {
        commentId: req.params.commentId
      });
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }

    // Check ownership or admin status
    if (comment.author.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      console.log('[COMMENT] Delete comment failed: Not authorized:', {
        commentId: req.params.commentId,
        userId: req.user._id,
        commentAuthorId: comment.author
      });
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this comment'
      });
    }

    comment.status = 'deleted';
    comment.isDeleted = true;
    comment.deletedAt = new Date();
    await comment.save();

    // If this is a parent comment, also delete all its replies
    let deletedRepliesCount = 0;
    if (!comment.parentComment) {
      const replies = await Comment.find({
        parentComment: comment._id,
        status: 'active',
        isDeleted: { $ne: true }
      });

      if (replies.length > 0) {
        await Comment.updateMany(
          {
            parentComment: comment._id,
            status: 'active',
            isDeleted: { $ne: true }
          },
          {
            $set: {
              status: 'deleted',
              isDeleted: true,
              deletedAt: new Date()
            }
          }
        );
        deletedRepliesCount = replies.length;
        console.log('[COMMENT] Also deleted replies:', {
          commentId: comment._id,
          repliesCount: deletedRepliesCount
        });
      }
    }

    // Update post's comment count (including the comment + its replies)
    const totalDeletedCount = 1 + deletedRepliesCount;
    const post = await Post.findById(comment.post);
    if (post && post.interactions.comments) {
      post.interactions.comments.count = Math.max(0, (post.interactions.comments.count || totalDeletedCount) - totalDeletedCount);
      // Remove user from comments.users if exists
      if (Array.isArray(post.interactions.comments.users)) {
        post.interactions.comments.users = post.interactions.comments.users.filter(
          u => u.user && u.user.toString() !== req.user._id.toString()
        );
      }
      await post.save();
    }

    console.log('[COMMENT] Comment deleted successfully:', {
      commentId: comment._id,
      timestamp: new Date().toISOString()
    });

    // Invalidate cache after deleting a comment
    clearCache('posts');

    // Emit Socket.IO event for real-time comment deletion
    socketService.broadcastToRoom(`post:${comment.post}`, 'comment:deleted', {
      commentId: comment._id,
      postId: comment.post,
      action: 'deleted'
    });

    res.json({
      success: true,
      message: 'Commentaire supprimé'
    });
  } catch (error) {
    console.error('[COMMENT] Delete comment error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(400).json({
      success: false,
      message: 'Failed to delete comment',
      error: error.message
    });
  }
};

exports.likeComment = async (req, res) => {
  console.log('[COMMENT] Like comment attempt:', {
    commentId: req.params.commentId,
    userId: req.user._id,
    timestamp: new Date().toISOString()
  });

  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) {
      console.log('[COMMENT] Like comment failed: Comment not found:', {
        commentId: req.params.commentId
      });
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }

    // Check if user already liked this comment
    if (!comment.likes.some(like => like.user.toString() === req.user._id.toString())) {
      comment.likes.push({
        user: req.user._id,
        createdAt: new Date()
      });
      await comment.save();

      // Create notification for comment author
      if (comment.author.toString() !== req.user._id.toString()) {
        await NotificationService.createNotification({
          type: 'comment_like',
          recipient: comment.author,
          sender: req.user._id,
          postId: comment.post,
          commentId: comment._id,
          message: 'a aimé votre commentaire',
          entityId: comment._id,
          entityType: 'comment'
        });
      }
    }

    console.log('[COMMENT] Comment liked successfully:', {
      commentId: comment._id,
      userId: req.user._id,
      timestamp: new Date().toISOString()
    });

    // Emit Socket.IO event for real-time like update
    socketService.broadcastToRoom(`post:${comment.post}`, 'comment:liked', {
      commentId: comment._id,
      postId: comment.post,
      userId: req.user._id,
      likes: comment.likes.length,
      action: 'liked'
    });

    res.json({
      success: true,
      message: 'Commentaire liké',
      data: {
        likes: comment.likes.length,
        isLiked: true
      }
    });
  } catch (error) {
    console.error('[COMMENT] Like comment error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(400).json({
      success: false,
      message: 'Failed to like comment',
      error: error.message
    });
  }
};

exports.unlikeComment = async (req, res) => {
  console.log('[COMMENT] Unlike comment attempt:', {
    commentId: req.params.commentId,
    userId: req.user._id,
    timestamp: new Date().toISOString()
  });

  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) {
      console.log('[COMMENT] Unlike comment failed: Comment not found:', {
        commentId: req.params.commentId
      });
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }

    // Remove the like
    comment.likes = comment.likes.filter(like => like.user.toString() !== req.user._id.toString());
    await comment.save();

    console.log('[COMMENT] Comment unliked successfully:', {
      commentId: comment._id,
      userId: req.user._id,
      timestamp: new Date().toISOString()
    });

    // Emit Socket.IO event for real-time unlike update
    socketService.broadcastToRoom(`post:${comment.post}`, 'comment:unliked', {
      commentId: comment._id,
      postId: comment.post,
      userId: req.user._id,
      likes: comment.likes.length,
      action: 'unliked'
    });

    res.json({
      success: true,
      message: 'Like retiré',
      data: {
        likes: comment.likes.length,
        isLiked: false
      }
    });
  } catch (error) {
    console.error('[COMMENT] Unlike comment error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(400).json({
      success: false,
      message: 'Failed to unlike comment',
      error: error.message
    });
  }
};

exports.reportComment = async (req, res) => {
  console.log('[COMMENT] Report comment attempt:', {
    commentId: req.params.commentId,
    userId: req.user._id,
    reason: req.body.reason,
    timestamp: new Date().toISOString()
  });

  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) {
      console.log('[COMMENT] Report comment failed: Comment not found:', {
        commentId: req.params.commentId
      });
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }

    await comment.report(req.user._id, req.body.reason);

    console.log('[COMMENT] Comment reported successfully:', {
      commentId: comment._id,
      userId: req.user._id,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Commentaire signalé'
    });
  } catch (error) {
    console.error('[COMMENT] Report comment error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(400).json({
      success: false,
      message: 'Failed to report comment',
      error: error.message
    });
  }
};

exports.getCommentLikes = async (req, res) => {
  console.log('[COMMENT] Get comment likes attempt:', {
    commentId: req.params.commentId,
    timestamp: new Date().toISOString()
  });

  try {
    const comment = await Comment.findById(req.params.commentId);

    if (!comment) {
      console.log('[COMMENT] Get comment likes failed: Comment not found:', {
        commentId: req.params.commentId
      });
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }

    // Populate likes - all users are in the User collection now
    const User = require('../models/user.model');

    console.log('[COMMENT] Likes array:', comment.likes);

    const likers = await Promise.all(
      comment.likes.map(async (like) => {
        // Handle old likes that might just be ObjectIds
        let userId;
        if (typeof like === 'object' && like.user) {
          userId = like.user;
        } else {
          // Old format - just an ObjectId
          userId = like;
        }

        console.log('[COMMENT] Processing like for userId:', userId);

        // All users (including journalists) are in the User collection
        const populatedUser = await User.findById(userId)
          .select('name fullName username avatarUrl profileImage isVerified role journalistRole organization');

        if (!populatedUser) {
          console.log('[COMMENT] User not found for like:', userId);
          return null;
        }

        // Format the user data with image URLs
        const avatarUrl = populatedUser.avatarUrl || populatedUser.profileImage;
        const formattedAvatarUrl = avatarUrl || null;

        return {
          id: populatedUser._id,
          _id: populatedUser._id,
          name: populatedUser.name || populatedUser.fullName || populatedUser.username,
          fullName: populatedUser.fullName || populatedUser.name,
          username: populatedUser.username || populatedUser.name,
          avatarUrl: formattedAvatarUrl,
          profileImage: formattedAvatarUrl,
          verified: populatedUser.isVerified || false,
          isVerified: populatedUser.isVerified || false,
          isJournalist: populatedUser.role === 'journalist',
          journalistRole: populatedUser.journalistRole,
          userType: populatedUser.role === 'journalist' ? 'journalist' : 'user'
        };
      })
    );

    // Filter out null values
    const validLikers = likers.filter(liker => liker !== null);

    console.log('[COMMENT] Comment likes fetched successfully:', {
      commentId: comment._id,
      likesCount: validLikers.length,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: validLikers
    });
  } catch (error) {
    console.error('[COMMENT] Get comment likes error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(400).json({
      success: false,
      message: 'Failed to get comment likes',
      error: error.message
    });
  }
};
