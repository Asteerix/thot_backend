const express = require('express');
const router = express.Router();
const postController = require('../controllers/post.controller');
const interactionsController = require('../controllers/interactions.controller');
const {
  auth,
  optionalAuth,
  requireJournalist,
  requireActiveStatus,
  updateLastActive
} = require('../middleware/auth.middleware');
const { validationRules } = require('../middleware/validation.middleware');
const { cacheMiddleware, keyGenerators } = require('../middleware/cache.middleware');
const { applyLikeRateLimiters } = require('../middleware/rateLimiter.middleware');

// Public routes with optional authentication and caching
router.get('/', optionalAuth, cacheMiddleware('posts', keyGenerators.posts), postController.getPosts);
router.get('/check-duplicate', optionalAuth, postController.checkDuplicate);
router.get('/:id', optionalAuth, cacheMiddleware('posts'), postController.getPost);

// Protected routes
router.use(auth);
router.use(requireActiveStatus);
router.use(updateLastActive);

// Journalist only routes
router.post(
  '/',
  requireJournalist,
  validationRules.createPost,
  postController.createPost
);

router.patch(
  '/:id',
  requireJournalist,
  postController.updatePost
);

router.delete(
  '/:id',
  requireJournalist,
  postController.deletePost
);

// Opposition routes
router.post(
  '/:postId/oppositions',
  requireJournalist,
  postController.addOpposition
);
router.delete(
  '/:postId/oppositions/:opposingPostId',
  requireJournalist,
  postController.removeOpposition
);
router.get('/:postId/oppositions', postController.getPostOppositions);
router.post('/:postId/opposition-vote', postController.voteOnOpposition);

// User interaction routes - Using optimized atomic operations
router.post('/:id/interact', postController.interactWithPost); // Keep for backward compatibility

// Like routes - Using atomic toggle with enhanced rate limiting
router.post('/:id/like', ...applyLikeRateLimiters, interactionsController.toggleLike);
router.post('/:id/dislike', ...applyLikeRateLimiters, interactionsController.toggleLike);
router.delete('/:id/likes', ...applyLikeRateLimiters, interactionsController.toggleLike);
// Political view voting - Using atomic operations
router.post('/:id/political-view', interactionsController.votePoliticalOrientation);

// Save/unsave routes - Using atomic toggle with transaction
router.post('/:id/save', interactionsController.toggleBookmark);
router.post('/:id/unsave', interactionsController.toggleBookmark);

// Get interaction users
router.get('/:id/interactions', postController.getInteractionUsers);
router.get('/:id/interactions/:type', postController.getInteractionUsers);

// Question voting routes
router.post('/:id/vote', postController.voteOnQuestion);
router.delete('/:id/vote', postController.removeVoteOnQuestion);

// Political voters route
router.get('/:id/political-voters', postController.getPoliticalVoters);

module.exports = router;
