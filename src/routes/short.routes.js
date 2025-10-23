const express = require('express');
const router = express.Router();
const postController = require('../controllers/post.controller');
const interactionsController = require('../controllers/interactions.controller');
const { auth, requireActiveStatus, updateLastActive } = require('../middleware/auth.middleware');
const { limiters } = require('../middleware/rateLimiter.middleware');

// Public routes - filter by type='short'
router.get('/',
  async (req, res, next) => {
    req.query.type = 'short'; // Force filter by short type
    next();
  },
  postController.getPosts
);

router.get('/:id', postController.getPost);

// Get comments for a short (delegate to comment routes or post controller)
router.get('/:id/comments',
  async (req, res) => {
    try {
      const Comment = require('../models/comment.model');
      const comments = await Comment.find({
        post: req.params.id,
        status: 'active'
      })
        .populate('author', 'username name avatarUrl isVerified role')
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        data: comments.map(c => c.getPublicData ? c.getPublicData(req.user?._id) : c)
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: 'Failed to get comments',
        error: error.message
      });
    }
  }
);

// Protected routes (require authentication)
router.use(auth);
router.use(requireActiveStatus);
router.use(updateLastActive);

// Create short - force type='short'
router.post('/',
  limiters.write,
  async (req, res, next) => {
    req.body.type = 'short'; // Force type to short
    next();
  },
  postController.createPost
);

router.put('/:id', postController.updatePost);
router.delete('/:id', postController.deletePost);
router.post('/:id/like', limiters.interaction, interactionsController.toggleLike);
router.post('/:id/dislike', limiters.interaction, interactionsController.toggleLike);
router.post('/:id/unlike', limiters.interaction, interactionsController.toggleLike); // Alias for dislike

// Add comment
router.post('/:id/comments',
  limiters.comment,
  async (req, res) => {
    try {
      const Comment = require('../models/comment.model');
      const Post = require('../models/post.model');

      const post = await Post.findById(req.params.id);
      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Short not found'
        });
      }

      const comment = new Comment({
        post: req.params.id,
        author: req.user._id,
        content: req.body.content,
        parentComment: req.body.parentCommentId
      });

      await comment.save();

      // Update post comment count
      if (!post.interactions) {
        post.interactions = {};
      }
      if (!post.interactions.comments) {
        post.interactions.comments = { users: [], count: 0 };
      }
      post.interactions.comments.users.push({
        comment: comment._id,
        createdAt: new Date()
      });
      post.interactions.comments.count = post.interactions.comments.users.length;
      await post.save();

      const populatedComment = await Comment.findById(comment._id)
        .populate('author', 'username name avatarUrl isVerified role');

      res.json({
        success: true,
        data: populatedComment.getPublicData ? populatedComment.getPublicData(req.user._id) : populatedComment
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: 'Failed to add comment',
        error: error.message
      });
    }
  }
);

// Track view
router.post('/:id/view',
  async (req, res) => {
    try {
      const Post = require('../models/post.model');
      const post = await Post.findById(req.params.id);

      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Short not found'
        });
      }

      // Increment view count
      if (!post.stats) {
        post.stats = {};
      }
      post.stats.views = (post.stats.views || 0) + 1;
      await post.save();

      res.json({
        success: true,
        data: {
          views: post.stats.views
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: 'Failed to track view',
        error: error.message
      });
    }
  }
);

// Get analytics (journalist only)
router.get('/:id/analytics',
  async (req, res) => {
    try {
      const Post = require('../models/post.model');
      const post = await Post.findById(req.params.id);

      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Short not found'
        });
      }

      // Check if user is the journalist
      if (post.journalist.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view analytics'
        });
      }

      res.json({
        success: true,
        data: {
          stats: post.stats,
          interactions: {
            likes: post.interactions?.likes?.count || 0,
            dislikes: post.interactions?.dislikes?.count || 0,
            comments: post.interactions?.comments?.count || 0,
            bookmarks: post.interactions?.bookmarks?.count || 0
          }
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: 'Failed to get analytics',
        error: error.message
      });
    }
  }
);

router.post('/:id/save', limiters.interaction, interactionsController.toggleBookmark);
router.post('/:id/unsave', limiters.interaction, interactionsController.toggleBookmark);

module.exports = router;
