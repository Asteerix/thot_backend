const express = require('express');
const router = express.Router();
const postController = require('../controllers/post.controller');
const interactionsController = require('../controllers/interactions.controller');
const { auth, requireActiveStatus, updateLastActive } = require('../middleware/auth.middleware');

// Create question (using Post model with type='question')
router.post('/',
  auth,
  requireActiveStatus,
  updateLastActive,
  async (req, res, next) => {
    req.body.type = 'question'; // Force type to question
    next();
  },
  postController.createPost
);

// Get all questions (paginated) - filter by type='question'
router.get('/',
  async (req, res, next) => {
    req.query.type = 'question'; // Force filter by question type
    next();
  },
  postController.getPosts
);

// Get single question
router.get('/:id',
  postController.getPost
);

// Update question
router.put('/:id',
  auth,
  requireActiveStatus,
  updateLastActive,
  postController.updatePost
);

// Delete question
router.delete('/:id',
  auth,
  requireActiveStatus,
  postController.deletePost
);

// Like/dislike routes - use interactions controller
router.post('/:id/like',
  auth,
  requireActiveStatus,
  updateLastActive,
  interactionsController.toggleLike
);

router.post('/:id/dislike',
  auth,
  requireActiveStatus,
  updateLastActive,
  interactionsController.toggleLike
);

// Vote on question - use Post model with metadata.question
router.post('/:id/vote',
  auth,
  requireActiveStatus,
  updateLastActive,
  async (req, res) => {
    try {
      const Post = require('../models/post.model');
      const { optionIds } = req.body;

      if (!optionIds || !Array.isArray(optionIds) || optionIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Option IDs array is required'
        });
      }

      const question = await Post.findById(req.params.id).where({
        type: 'question',
        status: 'published'
      });

      if (!question) {
        return res.status(404).json({
          success: false,
          message: 'Question not found'
        });
      }

      // Ensure metadata.question exists
      if (!question.metadata?.question) {
        return res.status(400).json({
          success: false,
          message: 'Question metadata not found'
        });
      }

      // Initialize voters array if needed
      if (!question.metadata.question.voters) {
        question.metadata.question.voters = [];
      }

      // Check if user already voted
      const existingVoteIndex = question.metadata.question.voters.findIndex(
        v => v.userId.toString() === req.user._id.toString()
      );

      if (existingVoteIndex !== -1) {
        // Update existing vote
        question.metadata.question.voters[existingVoteIndex] = {
          userId: req.user._id,
          optionIds: optionIds,
          votedAt: new Date()
        };
      } else {
        // Add new vote
        question.metadata.question.voters.push({
          userId: req.user._id,
          optionIds: optionIds,
          votedAt: new Date()
        });
      }

      // Update option vote counts
      if (!question.metadata.question.options) {
        question.metadata.question.options = [];
      }

      // Reset all vote counts
      question.metadata.question.options.forEach(opt => {
        opt.votes = 0;
      });

      // Recalculate from voters
      question.metadata.question.voters.forEach(voter => {
        voter.optionIds.forEach(optId => {
          const option = question.metadata.question.options.find(
            opt => opt._id.toString() === optId.toString()
          );
          if (option) {
            option.votes = (option.votes || 0) + 1;
          }
        });
      });

      // Update total votes
      question.metadata.question.totalVotes = question.metadata.question.voters.length;
      question.stats.responses = question.metadata.question.voters.length;

      question.markModified('metadata');
      await question.save();

      res.json({
        success: true,
        message: 'Vote recorded successfully',
        data: {
          totalVotes: question.metadata.question.totalVotes,
          options: question.metadata.question.options
        }
      });
    } catch (error) {
      console.error('Vote error:', error);
      res.status(400).json({
        success: false,
        message: 'Failed to vote',
        error: error.message
      });
    }
  }
);

// Get question results - use Post model
router.get('/:id/results',
  async (req, res) => {
    try {
      const Post = require('../models/post.model');
      const question = await Post.findById(req.params.id).where({
        type: 'question'
      });

      if (!question) {
        return res.status(404).json({
          success: false,
          message: 'Question not found'
        });
      }

      if (!question.metadata?.question) {
        return res.status(400).json({
          success: false,
          message: 'Question metadata not found'
        });
      }

      const totalVotes = question.metadata.question.totalVotes || 0;
      const options = question.metadata.question.options || [];

      const results = options.map(option => ({
        optionId: option._id,
        text: option.text,
        count: option.votes || 0,
        percentage: totalVotes > 0 ? ((option.votes || 0) / totalVotes) * 100 : 0
      }));

      res.json({
        success: true,
        data: {
          totalVotes,
          results
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: 'Failed to get results',
        error: error.message
      });
    }
  }
);

// Check if user has voted - use Post model
router.get('/:id/has-voted',
  auth,
  async (req, res) => {
    try {
      const Post = require('../models/post.model');
      const question = await Post.findById(req.params.id).where({
        type: 'question'
      });

      if (!question) {
        return res.status(404).json({
          success: false,
          message: 'Question not found'
        });
      }

      const hasVoted = question.metadata?.question?.voters?.some(
        voter => voter.userId.toString() === req.user._id.toString()
      ) || false;

      res.json({
        success: true,
        data: {
          hasVoted
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: 'Failed to check vote status',
        error: error.message
      });
    }
  }
);

// Save question - use interactions controller
router.post('/:id/save',
  auth,
  requireActiveStatus,
  updateLastActive,
  interactionsController.toggleBookmark
);

// Unsave question - use interactions controller
router.post('/:id/unsave',
  auth,
  requireActiveStatus,
  updateLastActive,
  interactionsController.toggleBookmark
);

module.exports = router;
