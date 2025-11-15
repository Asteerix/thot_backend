/* eslint-disable */
const Post = require('../models/post.model');
const ResponseHelper = require('../utils/responseHelper');

exports.getTrendingHashtags = async (req, res) => {
  console.log('[TRENDING] Get trending hashtags request:', {
    timestamp: new Date().toISOString()
  });

  try {
    // Get hashtags from last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const posts = await Post.find({
      createdAt: { $gte: sevenDaysAgo },
      hashtags: { $exists: true, $ne: [] },
      isDeleted: { $ne: true }
    }).select('hashtags createdAt');

    // Count hashtag occurrences
    const hashtagCounts = {};
    posts.forEach(post => {
      post.hashtags.forEach(hashtag => {
        hashtagCounts[hashtag] = (hashtagCounts[hashtag] || 0) + 1;
      });
    });

    // Sort by count and get top 20
    const trending = Object.entries(hashtagCounts)
      .map(([tag, count]) => ({
        tag,
        count,
        growth: Math.random() * 50 // TODO: Calculate real growth
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    console.log('[TRENDING] Trending hashtags fetched:', {
      count: trending.length,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: {
        trending,
        period: '7d'
      }
    });
  } catch (error) {
    console.error('[TRENDING] Get trending hashtags error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(400).json({
      success: false,
      message: 'Failed to fetch trending hashtags',
      error: error.message
    });
  }
};

exports.getTrendingTopics = async (req, res) => {
  console.log('[TRENDING] Get trending topics request:', {
    timestamp: new Date().toISOString()
  });

  try {
    // Get topics from posts in last 24 hours
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const posts = await Post.find({
      createdAt: { $gte: oneDayAgo },
      isDeleted: { $ne: true }
    }).select('domain tags views');

    // Count domain occurrences weighted by views
    const topicScores = {};
    posts.forEach(post => {
      const weight = 1 + (post.stats?.views || 0) / 100;
      if (post.domain) {
        topicScores[post.domain] = (topicScores[post.domain] || 0) + weight;
      }
      post.tags?.forEach(tag => {
        topicScores[tag] = (topicScores[tag] || 0) + weight;
      });
    });

    // Sort by score and get top 10
    const trending = Object.entries(topicScores)
      .map(([topic, score]) => ({
        topic,
        score: Math.round(score),
        posts: posts.filter(p => p.domain === topic || p.tags?.includes(topic)).length
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    console.log('[TRENDING] Trending topics fetched:', {
      count: trending.length,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: {
        trending,
        period: '24h'
      }
    });
  } catch (error) {
    console.error('[TRENDING] Get trending topics error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(400).json({
      success: false,
      message: 'Failed to fetch trending topics',
      error: error.message
    });
  }
};

exports.getPersonalizedTrending = async (req, res) => {
  console.log('[TRENDING] Get personalized trending request:', {
    userId: req.user._id,
    timestamp: new Date().toISOString()
  });

  try {
    const user = req.user;
    const interests = user.preferences?.topics || [];
    
    // Get posts matching user interests from last 48 hours
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    const query = {
      createdAt: { $gte: twoDaysAgo },
      isDeleted: { $ne: true }
    };
    
    if (interests.length > 0) {
      query.$or = [
        { domain: { $in: interests } },
        { tags: { $in: interests } }
      ];
    }

    const posts = await Post.find(query)
      .populate({
        path: 'journalist',
        select: 'name avatarUrl isVerified'
      })
      .sort({ 'stats.views': -1, 'interactions.likes.count': -1 })
      .limit(20);

    console.log('[TRENDING] Personalized trending fetched:', {
      count: posts.length,
      interests: interests.length,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: {
        posts: posts.map(post => {
          const userId = req.user?._id;
          return {
            id: post._id,
            title: post.title,
            type: post.type,
            imageUrl: post.imageUrl,
            journalist: post.journalist,
            interactions: ResponseHelper.formatInteractions(post, userId),
            stats: {
              views: post.stats?.views || 0,
              likes: post.interactions?.likes?.count || 0
            },
            createdAt: post.createdAt
          };
        }),
        interests
      }
    });
  } catch (error) {
    console.error('[TRENDING] Get personalized trending error:', {
      userId: req.user._id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(400).json({
      success: false,
      message: 'Failed to fetch personalized trending',
      error: error.message
    });
  }
};

exports.searchTrending = async (req, res) => {
  console.log('[TRENDING] Search trending request:', {
    query: req.query,
    timestamp: new Date().toISOString()
  });

  try {
    const { q, type = 'all' } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters long'
      });
    }

    const searchQuery = q.trim().toLowerCase();
    const results = {
      hashtags: [],
      topics: [],
      posts: []
    };

    // Search in hashtags
    if (type === 'all' || type === 'hashtags') {
      const posts = await Post.find({
        hashtags: { $regex: searchQuery, $options: 'i' },
        isDeleted: { $ne: true }
      }).select('hashtags');

      const hashtagSet = new Set();
      posts.forEach(post => {
        post.hashtags.forEach(tag => {
          if (tag.toLowerCase().includes(searchQuery)) {
            hashtagSet.add(tag);
          }
        });
      });

      results.hashtags = Array.from(hashtagSet).slice(0, 10);
    }

    // Search in topics/domains
    if (type === 'all' || type === 'topics') {
      const topicPosts = await Post.find({
        $or: [
          { domain: { $regex: searchQuery, $options: 'i' } },
          { tags: { $regex: searchQuery, $options: 'i' } }
        ],
        isDeleted: { $ne: true }
      }).select('domain tags');

      const topicSet = new Set();
      topicPosts.forEach(post => {
        if (post.domain && post.domain.toLowerCase().includes(searchQuery)) {
          topicSet.add(post.domain);
        }
        post.tags?.forEach(tag => {
          if (tag.toLowerCase().includes(searchQuery)) {
            topicSet.add(tag);
          }
        });
      });

      results.topics = Array.from(topicSet).slice(0, 10);
    }

    // Search in post titles
    if (type === 'all' || type === 'posts') {
      const posts = await Post.find({
        title: { $regex: searchQuery, $options: 'i' },
        isDeleted: { $ne: true }
      })
        .populate('journalist', '_id name avatarUrl isVerified')
        .select('title type imageUrl createdAt stats')
        .sort('-createdAt')
        .limit(10);

      const userId = req.user?._id;
      results.posts = posts.map(post => ({
        id: post._id,
        title: post.title,
        type: post.type,
        imageUrl: post.imageUrl,
        journalist: post.journalist,
        interactions: ResponseHelper.formatInteractions(post, userId),
        stats: post.stats,
        createdAt: post.createdAt
      }));
    }

    console.log('[TRENDING] Search results:', {
      query: searchQuery,
      type,
      results: {
        hashtags: results.hashtags.length,
        topics: results.topics.length,
        posts: results.posts.length
      },
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('[TRENDING] Search trending error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(400).json({
      success: false,
      message: 'Failed to search trending',
      error: error.message
    });
  }
};
