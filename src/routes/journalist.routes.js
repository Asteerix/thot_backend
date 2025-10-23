/* eslint-disable */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { auth, requireJournalist } = require('../middleware/auth.middleware');
const Post = require('../models/post.model');
const User = require('../models/user.model');
const { buildMediaUrl } = require('../utils/urlHelper');

// Add formation to journalist profile
router.post('/me/formations', auth, requireJournalist, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.formations) {
      user.formations = [];
    }

    const { title, institution, year, description } = req.body;

    if (!title || !institution || !year) {
      return res.status(400).json({
        success: false,
        message: 'Title, institution and year are required'
      });
    }

    user.formations.push({
      title,
      institution,
      year,
      description
    });

    await user.save();

    const profile = user.getPublicProfile();
    // Transform URLs to absolute URLs
    profile.avatarUrl = buildMediaUrl(req, profile.avatarUrl, '/assets/images/defaults/default_journalist_avatar.png');
    profile.coverUrl = buildMediaUrl(req, profile.coverUrl);

    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to add formation',
      error: error.message
    });
  }
});

// Update formation
router.put('/me/formations/:id', auth, requireJournalist, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const formation = user.formations.id(req.params.id);
    if (!formation) {
      return res.status(404).json({
        success: false,
        message: 'Formation not found'
      });
    }

    const { title, institution, year, description } = req.body;

    if (title) formation.title = title;
    if (institution) formation.institution = institution;
    if (year) formation.year = year;
    if (description !== undefined) formation.description = description;

    await user.save();

    const profile = user.getPublicProfile();
    // Transform URLs to absolute URLs
    profile.avatarUrl = buildMediaUrl(req, profile.avatarUrl);
    profile.coverUrl = buildMediaUrl(req, profile.coverUrl);

    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to update formation',
      error: error.message
    });
  }
});

// Delete formation
router.delete('/me/formations/:id', auth, requireJournalist, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.formations.pull(req.params.id);
    await user.save();

    res.json({
      success: true,
      data: user.getPublicProfile()
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to delete formation',
      error: error.message
    });
  }
});

// Add experience to journalist profile
router.post('/me/experience', auth, requireJournalist, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user || user.role !== 'journalist') {
      return res.status(404).json({
        success: false,
        message: 'Journalist profile not found'
      });
    }

    const { title, company, location, startDate, endDate, current, description } = req.body;

    if (!title || !company || !startDate) {
      return res.status(400).json({
        success: false,
        message: 'Title, company and start date are required'
      });
    }

    user.experience.push({
      title,
      location,
      company,
      startDate,
      endDate,
      current,
      description
    });

    await user.save();

    res.json({
      success: true,
      data: user.toObject()
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to add experience',
      error: error.message
    });
  }
});

// Update experience
router.put('/me/experience/:id', auth, requireJournalist, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user || user.role !== 'journalist') {
      return res.status(404).json({
        success: false,
        message: 'Journalist profile not found'
      });
    }

    const experience = user.experience.id(req.params.id);
    if (!experience) {
      return res.status(404).json({
        success: false,
        message: 'Experience not found'
      });
    }

    const { title, company, location, startDate, endDate, current, description } = req.body;

    if (title) experience.title = title;
    if (company) experience.company = company;
    if (location !== undefined) experience.location = location;
    if (startDate) experience.startDate = startDate;
    if (endDate !== undefined) experience.endDate = endDate;
    if (current !== undefined) experience.current = current;
    if (description !== undefined) experience.description = description;

    await user.save();

    res.json({
      success: true,
      data: user.toObject()
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to update experience',
      error: error.message
    });
  }
});

// Delete experience
router.delete('/me/experience/:id', auth, requireJournalist, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user || user.role !== 'journalist') {
      return res.status(404).json({
        success: false,
        message: 'Journalist profile not found'
      });
    }

    user.experience.pull(req.params.id);
    await user.save();

    res.json({
      success: true,
      data: user.toObject()
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to delete experience',
      error: error.message
    });
  }
});

// Get current journalist profile
router.get('/me', auth, requireJournalist, async (req, res) => {
  try {
    // req.user is already populated by auth middleware
    // It could be either a Journalist or User document with journalist role
    if (!req.user) {
      return res.status(404).json({
        success: false,
        message: 'Journalist profile not found'
      });
    }

    const profile = req.user.getPublicProfile();
    // Transform URLs to absolute URLs
    profile.avatarUrl = buildMediaUrl(req, profile.avatarUrl);
    profile.coverUrl = buildMediaUrl(req, profile.coverUrl);
    
    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to get journalist profile',
      error: error.message
    });
  }
});

// Get journalist's posts
router.get('/me/posts', auth, requireJournalist, async (req, res) => {
  try {
    const { page = 1, limit = 20, status = 'published', type } = req.query;
    const query = { journalist: req.user._id };

    if (status) {
      query.status = status;
    }

    if (type) {
      query.type = type;
    }

    const posts = await Post.find(query)
      .populate({
        path: 'journalist',
        select: 'name username avatarUrl specialties isVerified organization journalistRole',
        transform: (doc) => {
          if (!doc) {
            return {
              id: req.user._id.toString(),
              name: req.user.name || req.user.username || 'Journaliste inconnu',
              avatarUrl: req.user.avatarUrl || '/assets/images/defaults/default_journalist_avatar.png',
              isVerified: req.user.isVerified || false,
              organization: req.user.organization || '',
              specialties: req.user.specialties || []
            };
          }
          const obj = doc.toObject();
          return {
            id: obj._id.toString(),
            name: obj.name || obj.username || 'Journaliste inconnu',
            avatarUrl: obj.avatarUrl || '/assets/images/defaults/default_journalist_avatar.png',
            isVerified: obj.isVerified || false,
            organization: obj.organization || '',
            specialties: obj.specialties || [],
            isVerified: obj.verified || false
          };
        }
      })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Post.countDocuments(query);

    // Process posts to handle URLs dynamically
    const postsWithAbsoluteUrls = posts.map(post => {
      const postObj = post.toObject();
      
      // Ensure _id is always included as a string
      postObj._id = post._id.toString();
      
      // Handle URLs dynamically
      postObj.imageUrl = buildMediaUrl(req, postObj.imageUrl);
      postObj.videoUrl = buildMediaUrl(req, postObj.videoUrl);
      
      if (postObj.journalist && postObj.journalist.avatarUrl) {
        postObj.journalist.avatarUrl = buildMediaUrl(req, postObj.journalist.avatarUrl);
      }
      
      return postObj;
    });

    res.json({
      success: true,
      data: {
        posts: postsWithAbsoluteUrls,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to get journalist posts',
      error: error.message
    });
  }
});

// Get all journalists
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20, specialty, suggested, search } = req.query;
    const skip = (page - 1) * limit;
    let sort = { 'stats.postsCount': -1 };

    // Build query for both collections
    const baseQuery = {
      _id: { $ne: req.user._id } // Exclude current user
    };

    // Add search functionality
    if (search && search.trim()) {
      baseQuery.$or = [
        { name: { $regex: search.trim(), $options: 'i' } },
        { username: { $regex: search.trim(), $options: 'i' } },
        { organization: { $regex: search.trim(), $options: 'i' } }
      ];
    }

    // Handle suggestions
    let excludedIds = [req.user._id];
    if (suggested === 'true') {
      // Get current user's followed journalists
      const currentUser = await User.findById(req.user._id).select('followedJournalists');
      
      if (currentUser && currentUser.followedJournalists && currentUser.followedJournalists.length > 0) {
        excludedIds = [...excludedIds, ...currentUser.followedJournalists];
      }
      
      // Sort by popularity (followers count) for suggestions
      sort = { 'stats.followers': -1, 'stats.postsCount': -1 };
    }

    // Query for User collection with journalist role
    const userQuery = { ...baseQuery, role: 'journalist' };
    if (specialty) {
      userQuery.specialties = specialty;
    }
    if (excludedIds.length > 0) {
      userQuery._id = { $nin: excludedIds };
    }

    // Get journalists from User collection
    const userJournalistResults = await User.find(userQuery).sort({ 'stats.followers': -1 });

    // Transform results
    const allJournalists = [];

    // Add journalists from User collection
    userJournalistResults.forEach(user => {
      const profile = user.getPublicProfile(req.user);
      profile.avatarUrl = buildMediaUrl(req, profile.avatarUrl, '/assets/images/defaults/default_journalist_avatar.png');
      profile.coverUrl = buildMediaUrl(req, profile.coverUrl);
      profile.isJournalist = true;
      profile.type = 'journalist';
      allJournalists.push(profile);
    });

    // Sort combined results
    allJournalists.sort((a, b) => {
      if (suggested === 'true') {
        return (b.followersCount || 0) - (a.followersCount || 0);
      }
      return (b.stats?.postes || 0) - (a.stats?.postes || 0);
    });

    // Paginate results
    const paginatedJournalists = allJournalists.slice(skip, skip + parseInt(limit));
    const total = allJournalists.length;

    res.json({
      success: true,
      data: {
        journalists: paginatedJournalists,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('[JOURNALIST] Get all journalists error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to get journalists',
      error: error.message
    });
  }
});

// Get specific journalist profile
router.get('/:id', auth, async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, role: 'journalist' });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Journalist not found'
      });
    }

    const profile = user.getPublicProfile(req.user);
    // Transform URLs to absolute URLs
    profile.avatarUrl = buildMediaUrl(req, profile.avatarUrl, '/assets/images/defaults/default_journalist_avatar.png');
    profile.coverUrl = buildMediaUrl(req, profile.coverUrl);

    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to get journalist profile',
      error: error.message
    });
  }
});

// Get journalist stats (with auth for more detailed info)
router.get('/:id/stats', auth, async (req, res) => {
  try {
    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid journalist ID format'
      });
    }
    
    // Get period from query params
    const { period } = req.query;
    let dateFilter = {};
    
    if (period) {
      const now = new Date();
      let startDate;
      
      switch (period) {
      case '7d':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case '14d': // For previous period comparison
        startDate = new Date(now.setDate(now.getDate() - 14));
        break;
      case '30d':
        startDate = new Date(now.setDate(now.getDate() - 30));
        break;
      case '60d': // For previous period comparison
        startDate = new Date(now.setDate(now.getDate() - 60));
        break;
      case '3m':
        startDate = new Date(now.setMonth(now.getMonth() - 3));
        break;
      case '6m': // For previous period comparison
        startDate = new Date(now.setMonth(now.getMonth() - 6));
        break;
      case '1y':
        startDate = new Date(now.setFullYear(now.getFullYear() - 1));
        break;
      case '2y': // For previous period comparison
        startDate = new Date(now.setFullYear(now.getFullYear() - 2));
        break;
      default:
        // If period is not recognized, use all time
        startDate = null;
      }
      
      if (startDate) {
        dateFilter = { createdAt: { $gte: startDate } };
      }
    }
    
    const user = await User.findOne({ _id: req.params.id, role: 'journalist' });

    if (user) {
        // Get counts for different post types
        const articleCount = await Post.countDocuments({
          journalist: req.params.id,
          status: 'published',
          type: 'article',
          ...dateFilter
        });
        
        const shortCount = await Post.countDocuments({
          journalist: req.params.id,
          status: 'published',
          type: 'short',
          ...dateFilter
        });
        
        const questionCount = await Post.countDocuments({
          journalist: req.params.id,
          status: 'published',
          type: 'question',
          ...dateFilter
        });
        
        // Get views count
        const posts = await Post.find({
          journalist: req.params.id,
          status: 'published',
          ...dateFilter
        }).select('stats.views');
        
        const totalViews = posts.reduce((sum, post) => sum + (post.stats?.views || 0), 0);
        
        // Get engagement stats
        const engagementPosts = await Post.find({
          journalist: req.params.id,
          status: 'published',
          ...dateFilter
        }).select('_id interactions.likes.users');
        
        const totalLikes = engagementPosts.reduce((sum, post) => sum + (post.interactions?.likes?.users?.length || 0), 0);
        
        // Get real comment count from Comment collection
        const Comment = require('../models/comment.model');
        const postIds = engagementPosts.map(post => post._id);
        const commentQuery = { post: { $in: postIds } };
        if (dateFilter.createdAt) {
          commentQuery.createdAt = dateFilter.createdAt;
        }
        const totalComments = await Comment.countDocuments(commentQuery);
        
        // Count actual followers and following for User journalists
        const followersCount = user.followers ? user.followers.length : 0;
        const followingCount = (user.following ? user.following.length : 0) + 
                              (user.followedJournalists ? user.followedJournalists.length : 0);
        
        // Get political orientation stats for User journalists
        const politicalPosts = await Post.find({
          journalist: req.params.id,
          status: 'published',
          type: { $ne: 'question' }, // Exclude questions from political analysis
          ...dateFilter
        }).select('politicalOrientation.userVotes politicalOrientation.journalistChoice politicalOrientation.finalScore');
        
        // Count posts by their median orientation
        const postsByOrientation = {
          extremely_conservative: 0,
          conservative: 0,
          neutral: 0,
          progressive: 0,
          extremely_progressive: 0
        };
        
        // Calculate median for each post and count
        politicalPosts.forEach(post => {
          if (post.politicalOrientation && post.politicalOrientation.userVotes) {
            const votes = post.politicalOrientation.userVotes;
            
            // Build frequency array
            const frequencies = [
              votes.extremely_conservative || 0,
              votes.conservative || 0,
              votes.neutral || 0,
              votes.progressive || 0,
              votes.extremely_progressive || 0
            ];
            
            // Calculate total votes
            const totalVotes = frequencies.reduce((sum, freq) => sum + freq, 0);
            
            // Find median
            let medianOrientation = 'neutral';
            if (totalVotes > 0) {
              const medianPosition = totalVotes / 2;
              let cumulative = 0;
              
              for (let i = 0; i < frequencies.length; i++) {
                cumulative += frequencies[i];
                if (cumulative > medianPosition) {
                  const orientations = ['extremely_conservative', 'conservative', 'neutral', 'progressive', 'extremely_progressive'];
                  medianOrientation = orientations[i];
                  break;
                } else if (cumulative === medianPosition && totalVotes % 2 === 0) {
                  // Handle ties
                  for (let j = i + 1; j < frequencies.length; j++) {
                    if (frequencies[j] > 0) {
                      const score1 = i - 2;
                      const score2 = j - 2;
                      const avgScore = (score1 + score2) / 2;
                      const median = avgScore > 0 ? Math.floor(avgScore) : Math.ceil(avgScore);
                      const orientations = ['extremely_conservative', 'conservative', 'neutral', 'progressive', 'extremely_progressive'];
                      medianOrientation = orientations[median + 2];
                      break;
                    }
                  }
                  break;
                }
              }
            }
            
            postsByOrientation[medianOrientation]++;
          }
        });
        
        // Calculate journalist's average orientation based on all posts
        let averageOrientation = 'neutral';
        const totalPoliticalPosts = Object.values(postsByOrientation).reduce((sum, count) => sum + count, 0);
        if (totalPoliticalPosts > 0) {
          // Weight each orientation by its count
          const weightedSum = 
            postsByOrientation.extremely_conservative * (-2) +
            postsByOrientation.conservative * (-1) +
            postsByOrientation.neutral * 0 +
            postsByOrientation.progressive * 1 +
            postsByOrientation.extremely_progressive * 2;
          
          const averageScore = weightedSum / totalPoliticalPosts;
          
          // Map average score to orientation
          if (averageScore <= -1.5) averageOrientation = 'extremely_conservative';
          else if (averageScore <= -0.5) averageOrientation = 'conservative';
          else if (averageScore <= 0.5) averageOrientation = 'neutral';
          else if (averageScore <= 1.5) averageOrientation = 'progressive';
          else averageOrientation = 'extremely_progressive';
        }
        
      const stats = {
        postes: articleCount,
        shorts: shortCount,
        questions: questionCount,
        views: totalViews,
        likes: totalLikes,
        comments: totalComments,
        followers: followersCount,
        following: followingCount,
        rating: user.stats?.rating || 0,
        politicalOrientation: {
          postsByOrientation,
          averageOrientation,
          totalAnalyzedPosts: totalPoliticalPosts
        }
      };

      return res.json({
        success: true,
        data: stats
      });
    }

    return res.status(404).json({
      success: false,
      message: 'Journalist not found'
    });
  } catch (error) {
    console.error('Error in GET /journalists/:id/stats:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to get journalist stats',
      error: error.message
    });
  }
});

// Remove follower
router.post('/:id/remove', auth, requireJournalist, async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, role: 'journalist' });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Journalist not found'
      });
    }

    // Check if trying to remove follower from someone else's profile
    if (req.user._id.toString() !== req.params.id) {
      return res.status(403).json({
        success: false,
        message: 'Cannot remove followers from another journalist\'s profile'
      });
    }

    user.followers = user.followers.filter(
      id => id.toString() !== req.body.followerId
    );
    await user.save();

    res.json({
      success: true,
      message: 'Follower retiré',
      data: {
        followersCount: user.followers.length
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to remove follower',
      error: error.message
    });
  }
});

// Get journalist's followers
router.get('/:id/followers', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const user = await User.findOne({ _id: req.params.id, role: 'journalist' })
      .populate({
        path: 'followers',
        select: 'name username avatarUrl organization isVerified role',
        options: {
          skip: (page - 1) * limit,
          limit: parseInt(limit),
          sort: { createdAt: -1 }
        }
      });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Journalist not found'
      });
    }

    const total = user.followers ? user.followers.length : 0;
    const followers = user.followers ? user.followers.map(follower => ({
      id: follower._id,
      name: follower.name,
      username: follower.username,
      avatarUrl: buildMediaUrl(req, follower.avatarUrl),
      organization: follower.organization,
      isVerified: follower.isVerified,
      isJournalist: follower.role === 'journalist'
    })) : [];

    res.json({
      success: true,
      data: {
        followers,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to get followers',
      error: error.message
    });
  }
});

// Get journalist's following
router.get('/:id/following', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const user = await User.findOne({ _id: req.params.id, role: 'journalist' })
      .populate({
        path: 'following',
        select: 'name username avatarUrl organization isVerified role',
        options: {
          skip: (page - 1) * limit,
          limit: parseInt(limit),
          sort: { createdAt: -1 }
        }
      })
      .populate({
        path: 'followedJournalists',
        select: 'name username avatarUrl organization isVerified',
        options: {
          sort: { createdAt: -1 }
        }
      });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Journalist not found'
      });
    }

    // Combine following (users) and followedJournalists
    const followingUsers = user.following || [];
    const followedJournalists = user.followedJournalists || [];

    // Map users
    const mappedUsers = followingUsers.map(followed => ({
      id: followed._id,
      name: followed.name,
      username: followed.username,
      avatarUrl: buildMediaUrl(req, followed.avatarUrl),
      organization: followed.organization,
      isVerified: followed.isVerified,
      isJournalist: followed.role === 'journalist'
    }));

    // Map journalists
    const mappedJournalists = followedJournalists.map(followed => ({
      id: followed._id,
      name: followed.name,
      username: followed.username,
      avatarUrl: buildMediaUrl(req, followed.avatarUrl),
      organization: followed.organization,
      isVerified: followed.isVerified,
      isJournalist: true
    }));

    // Combine and paginate
    const allFollowing = [...mappedUsers, ...mappedJournalists];
    const total = allFollowing.length;
    const startIndex = (page - 1) * limit;
    const paginatedFollowing = allFollowing.slice(startIndex, startIndex + parseInt(limit));

    res.json({
      success: true,
      data: {
        following: paginatedFollowing,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to get following',
      error: error.message
    });
  }
});

// Get journalist's stats (public route - no auth required)
router.get('/:id/stats/public', async (req, res) => {
  try {
    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid journalist ID format'
      });
    }

    const user = await User.findOne({ _id: req.params.id, role: 'journalist' });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Journalist not found'
      });
    }

    res.json({
      success: true,
      data: {
        postes: user.stats?.postes || 0,
        followers: user.stats?.followers || 0,
        following: user.stats?.following || 0,
        rating: user.stats?.rating || 0
      }
    });
  } catch (error) {
    console.error('Error in GET /journalists/:id/stats/public:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to get journalist stats',
      error: error.message
    });
  }
});

// Get specific journalist's posts
router.get('/:id/posts', auth, async (req, res) => {
  try {
    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid journalist ID format'
      });
    }
    
    const { page = 1, limit = 20, type } = req.query;
    const query = {
      journalist: req.params.id,
      status: 'published'
    };

    if (type) {
      query.type = type;
    }

    const posts = await Post.find(query)
      .populate({
        path: 'journalist',
        select: 'name username avatarUrl specialties isVerified organization journalistRole',
        transform: (doc) => {
          if (!doc) {
            return null;
          }
          const obj = doc.toObject();
          return {
            id: obj._id.toString(),
            name: obj.name || obj.username || 'Journaliste inconnu',
            avatarUrl: obj.avatarUrl || '/assets/images/defaults/default_journalist_avatar.png',
            isVerified: obj.isVerified || false,
            organization: obj.organization || '',
            specialties: obj.specialties || [],
            isVerified: obj.verified || false
          };
        }
      })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Post.countDocuments(query);

    // Process posts to handle URLs dynamically
    const postsWithAbsoluteUrls = posts.map(post => {
      const postObj = post.toObject();
      
      // Ensure _id is always included as a string
      postObj._id = post._id.toString();
      
      // Handle URLs dynamically
      postObj.imageUrl = buildMediaUrl(req, postObj.imageUrl);
      postObj.videoUrl = buildMediaUrl(req, postObj.videoUrl);
      
      if (postObj.journalist && postObj.journalist.avatarUrl) {
        postObj.journalist.avatarUrl = buildMediaUrl(req, postObj.journalist.avatarUrl);
      }
      
      return postObj;
    });

    res.json({
      success: true,
      data: {
        posts: postsWithAbsoluteUrls,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('[JOURNALIST] Get posts error:', error);
    
    // Handle specific MongoDB cast errors
    if (error.name === 'CastError' && error.kind === 'ObjectId') {
      return res.status(400).json({
        success: false,
        message: 'Invalid journalist ID format',
        error: 'The provided ID is not a valid MongoDB ObjectId'
      });
    }
    
    res.status(400).json({
      success: false,
      message: 'Failed to get journalist posts',
      error: error.message
    });
  }
});

// Get journalist's questions
router.get('/:id/questions', auth, async (req, res) => {
  try {
    const Question = require('../models/question.model');
    const { page = 1, limit = 20 } = req.query;
    
    const questions = await Question.find({ journalist: req.params.id })
      .populate('author', 'username name avatarUrl')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Question.countDocuments({ journalist: req.params.id });

    res.json({
      success: true,
      data: {
        questions,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to get journalist questions',
      error: error.message
    });
  }
});

// Create question for journalist
router.post('/:id/questions', auth, async (req, res) => {
  try {
    const Question = require('../models/question.model');
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Question content is required'
      });
    }

    const user = await User.findOne({ _id: req.params.id, role: 'journalist' });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Journalist not found'
      });
    }

    const question = new Question({
      content,
      author: req.user._id,
      journalist: req.params.id
    });

    await question.save();
    await question.populate('author', 'username name avatarUrl');

    res.status(201).json({
      success: true,
      data: question
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to create question',
      error: error.message
    });
  }
});

// Answer journalist question
router.post('/:id/questions/:questionId/answer', auth, requireJournalist, async (req, res) => {
  try {
    const Question = require('../models/question.model');
    const { answer } = req.body;

    if (!answer || answer.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Answer is required'
      });
    }

    // Verify the journalist is answering their own question
    if (req.user._id.toString() !== req.params.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only answer questions directed to you'
      });
    }

    const question = await Question.findOne({
      _id: req.params.questionId,
      journalist: req.params.id
    });

    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }

    if (question.answered) {
      return res.status(400).json({
        success: false,
        message: 'Question already answered'
      });
    }

    question.answer = answer;
    question.answered = true;
    question.answeredAt = new Date();

    await question.save();
    await question.populate('author', 'username name avatarUrl');
    await question.populate('journalist', 'name username avatarUrl');

    res.json({
      success: true,
      data: question
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to answer question',
      error: error.message
    });
  }
});

// Verify journalist (admin only)
router.post('/:id/verify', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const user = await User.findOne({ _id: req.params.id, role: 'journalist' });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Journalist not found'
      });
    }

    user.isVerified = true;
    await user.save();

    res.json({
      success: true,
      message: 'Journalist verified successfully',
      data: user.getPublicProfile()
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to verify journalist',
      error: error.message
    });
  }
});

// Follow journalist
router.post('/:id/follow', auth, async (req, res) => {
  try {
    const journalistId = req.params.id;
    const userId = req.user._id;

    // Check if journalist exists
    const journalist = await User.findOne({ _id: journalistId, role: 'journalist' });

    if (!journalist) {
      return res.status(404).json({
        success: false,
        message: 'Journalist not found'
      });
    }

    // Get current user
    const user = await User.findById(userId);

    // Use the user model's followJournalist method
    const followersCount = await user.followJournalist(journalistId);

    res.json({
      success: true,
      message: 'Successfully followed journalist',
      data: {
        followersCount,
        isFollowing: true
      }
    });
  } catch (error) {
    console.error('[JOURNALIST] Follow error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to follow journalist'
    });
  }
});

// Unfollow journalist
router.post('/:id/unfollow', auth, async (req, res) => {
  try {
    const journalistId = req.params.id;
    const userId = req.user._id;

    // Check if journalist exists
    const journalist = await User.findOne({ _id: journalistId, role: 'journalist' });

    if (!journalist) {
      return res.status(404).json({
        success: false,
        message: 'Journalist not found'
      });
    }

    // Get current user
    const user = await User.findById(userId);

    // Use the user model's unfollowJournalist method
    const followersCount = await user.unfollowJournalist(journalistId);

    res.json({
      success: true,
      message: 'Successfully unfollowed journalist',
      data: {
        followersCount,
        isFollowing: false
      }
    });
  } catch (error) {
    console.error('[JOURNALIST] Unfollow error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to unfollow journalist'
    });
  }
});

// Get follow status
router.get('/:id/follow/status', auth, async (req, res) => {
  try {
    const journalistId = req.params.id;
    const userId = req.user._id;

    // Get current user with followed journalists
    const user = await User.findById(userId).select('followedJournalists');

    const isFollowing = user.followedJournalists &&
                       user.followedJournalists.some(id => id.toString() === journalistId);

    // Get journalist's follower count
    const journalist = await User.findOne({ _id: journalistId, role: 'journalist' }).select('followers');

    let followersCount = 0;
    if (journalist && journalist.followers) {
      followersCount = journalist.followers.length;
    }

    res.json({
      success: true,
      data: {
        isFollowing,
        followersCount
      }
    });
  } catch (error) {
    console.error('[JOURNALIST] Get follow status error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to get follow status',
      error: error.message
    });
  }
});

// Get journalist's followers (duplicate - already defined above)
// This route is a duplicate of the one defined earlier

// Get journalist's following list (duplicate - already defined above)
// This route is a duplicate of the one defined earlier

// Remove a follower (journalist only, for their own profile)
router.delete('/:id/followers/:followerId', auth, requireJournalist, async (req, res) => {
  try {
    // Verify the journalist is removing from their own profile
    if (req.user._id.toString() !== req.params.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to manage followers for this journalist'
      });
    }

    const journalist = await User.findOne({ _id: req.params.id, role: 'journalist' });

    if (!journalist) {
      return res.status(404).json({
        success: false,
        message: 'Journalist not found'
      });
    }

    // Remove from user's followedJournalists
    await User.findByIdAndUpdate(req.params.followerId, {
      $pull: { followedJournalists: req.params.id }
    });

    // Update journalist's follower count
    if (journalist.followers) {
      journalist.followers = journalist.followers.filter(
        id => id.toString() !== req.params.followerId
      );
      await journalist.save();
    }

    res.json({
      success: true,
      message: 'Follower removed successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to remove follower',
      error: error.message
    });
  }
});

module.exports = router;
