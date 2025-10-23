const express = require('express');
const router = express.Router();
const { auth, optionalAuth, requireActiveStatus, updateLastActive } = require('../middleware/auth.middleware');
const commentController = require('../controllers/comment.controller');
const { validationRules } = require('../middleware/validation.middleware');
const { limiters } = require('../middleware/rateLimiter.middleware');

// Get comments for a post (with optional auth to calculate isLiked)
router.get('/post/:postId', optionalAuth, commentController.getComments);

// Get replies for a comment (with optional auth to calculate isLiked)
router.get('/replies/:commentId', optionalAuth, commentController.getReplies);

// Protected routes
router.use(auth);
router.use(requireActiveStatus);
router.use(updateLastActive);

// Create comment on a post
router.post('/post/:postId', limiters.comment, validationRules.createComment, commentController.createComment);

// Update comment
router.put('/:commentId', limiters.write, commentController.updateComment);

// Delete comment
router.delete('/:commentId', commentController.deleteComment);

// Like comment
router.post('/:commentId/like', limiters.interaction, commentController.likeComment);

// Unlike comment
router.post('/:commentId/unlike', limiters.interaction, commentController.unlikeComment);

// Report comment
router.post('/:commentId/report', limiters.report, validationRules.createReport, commentController.reportComment);

// Get comment likes
router.get('/:commentId/likes', commentController.getCommentLikes);

module.exports = router;
