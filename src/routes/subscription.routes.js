const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth.middleware');
const Post = require('../models/post.model');
const User = require('../models/user.model');

/**
 * @route   GET /api/subscriptions/posts
 * @desc    Get posts from followed journalists
 * @access  Private
 */
router.get('/posts', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const userId = req.user.userId || req.user._id;

    // Get user with their following list
    const user = await User.findById(userId).select('following');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // If user is not following anyone, return empty array
    if (!user.following || user.following.length === 0) {
      return res.json({
        success: true,
        data: {
          posts: [],
          pagination: {
            currentPage: parseInt(page),
            totalPages: 0,
            totalPosts: 0,
            hasNextPage: false,
            hasPreviousPage: false
          }
        }
      });
    }

    // Get posts from followed journalists
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const posts = await Post.find({
      journalist: { $in: user.following },
      status: 'published',
      isDeleted: { $ne: true }
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('journalist', 'name username avatarUrl specialties isVerified organization journalistRole')
      .lean();

    // Get total count for pagination
    const totalPosts = await Post.countDocuments({
      journalist: { $in: user.following },
      status: 'published',
      isDeleted: { $ne: true }
    });

    const totalPages = Math.ceil(totalPosts / parseInt(limit));

    res.json({
      success: true,
      data: {
        posts,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalPosts,
          hasNextPage: parseInt(page) < totalPages,
          hasPreviousPage: parseInt(page) > 1
        }
      }
    });
  } catch (error) {
    console.error('Error fetching subscription posts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching posts from subscriptions',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/subscriptions/journalists
 * @desc    Get list of followed journalists
 * @access  Private
 */
router.get('/journalists', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user._id;

    const user = await User.findById(userId)
      .populate('following', 'name username avatarUrl specialties isVerified organization journalistRole bio')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        journalists: user.following || []
      }
    });
  } catch (error) {
    console.error('Error fetching subscribed journalists:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching subscribed journalists',
      error: error.message
    });
  }
});

module.exports = router;
