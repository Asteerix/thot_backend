const express = require('express');
const router = express.Router();
const { auth, requireActiveStatus, updateLastActive } = require('../middleware/auth.middleware');
const { followRateLimiter, strictActionRateLimiter } = require('../middleware/rateLimiter.middleware');
const userController = require('../controllers/user.controller');

// Protected routes
router.use(auth);
router.use(requireActiveStatus);
router.use(updateLastActive);

// Get user's saved posts
router.get('/saved-posts', userController.getSavedPosts);

// Get user's saved shorts
router.get('/saved-shorts', userController.getSavedShorts);

// Get user's read history
router.get('/read-history', userController.getReadHistory);

// Get user's followed journalists
router.get('/followed-journalists', userController.getFollowedJournalists);

// Update user preferences
router.patch('/preferences', userController.updatePreferences);

// Get user's public content
router.get('/public-content/:userId', userController.getPublicContent);

// Toggle content as public/private
router.post('/toggle-public-content', userController.togglePublicContent);

// Follow a journalist
router.post('/follow/:journalistId', followRateLimiter, strictActionRateLimiter, userController.followJournalist);

// Unfollow a journalist
router.post('/unfollow/:journalistId', followRateLimiter, strictActionRateLimiter, userController.unfollowJournalist);

// Get follow status for a journalist
router.get('/follow-status/:journalistId', userController.getFollowStatus);

// Get user's statistics
router.get('/stats', userController.getStats);

// Update user profile
router.put('/:id', userController.updateProfile);

// Get user profile by ID - MUST BE LAST ROUTE
router.get('/:id', userController.getProfile);

module.exports = router;