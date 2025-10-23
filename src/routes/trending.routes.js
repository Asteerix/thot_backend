const express = require('express');
const router = express.Router();
const trendingController = require('../controllers/trending.controller');
const { auth } = require('../middleware/auth.middleware');

// Public routes
router.get('/hashtags', trendingController.getTrendingHashtags);
router.get('/topics', trendingController.getTrendingTopics);

// Protected routes
router.use(auth);
router.get('/personalized', trendingController.getPersonalizedTrending);
router.get('/search', trendingController.searchTrending);

module.exports = router;
