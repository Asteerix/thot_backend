/* eslint-disable */
const mongoose = require('mongoose');
const Post = require('../models/post.model');
const User = require('../models/user.model');
const { buildMediaUrl } = require('../utils/urlHelper');
const { formatUser } = require('../formatters/user.formatter');
const NotificationService = require('../services/notification.service');
const { clearCache } = require('../middleware/cache.middleware');
const ResponseHelper = require('../utils/responseHelper');

function getPoliticalViewColor(view) {
  switch (view) {
  case 'extremelyConservative':
    return '#FF0000'; // Red
  case 'conservative':
    return '#FF6B6B'; // Light red
  case 'neutral':
    return '#808080'; // Gray
  case 'progressive':
    return '#6B8EFF'; // Light blue
  case 'extremelyProgressive':
    return '#0000FF'; // Blue
  default:
    return '#808080'; // Default gray
  }
}

exports.createPost = async (req, res) => {
  try {
    if (!req.isJournalist) {
      return res.status(403).json({
        success: false,
        message: 'Only journalists can create posts'
      });
    }

    const { type } = req.body;

    // Validate required fields based on type
    if (type === 'video' || type === 'short') {
      if (!req.body.videoUrl) {
        return res.status(400).json({
          success: false,
          message: `Video is required for ${type}s`
        });
      }

      // Validate duration
      const duration = req.body.metadata?.[type]?.duration;
      if (duration) {
        if (type === 'short' && duration > 30) {
          return res.status(400).json({
            success: false,
            message: 'Les shorts ne peuvent pas dépasser 30 secondes'
          });
        }
        if (type === 'video' && duration > 300) {
          return res.status(400).json({
            success: false,
            message: 'Les vidéos ne peuvent pas dépasser 5 minutes (300 secondes)'
          });
        }
      }
    }

    // Extract opposition data if provided
    const { opposingPostId, oppositionReason, opposingPosts, ...postData } = req.body;

    const post = new Post({
      ...postData,
      journalist: req.user._id,
      politicalOrientation: {
        ...req.body.politicalOrientation,
        journalistChoice:
          req.body.politicalOrientation?.journalistChoice || 'neutral'
      }
    });

    const savedPost = await post.save();

    console.log('[POST] Post created:', {
      postId: savedPost._id,
      title: savedPost.title,
      hasOpposingPostId: !!opposingPostId,
      hasOpposingPosts: !!opposingPosts,
      opposingPosts: opposingPosts
    });

    // Notify followers about new post
    const journalist = await User.findById(req.user._id);
    if (journalist && journalist.followers && journalist.followers.length > 0) {
      // Notify all followers about the new post
      await NotificationService.notifyFollowersOfNewPost(
        savedPost._id,
        req.user._id
      );
    }

    // Handle oppositions - support both single and multiple
    const opposingPostsArray = opposingPosts && Array.isArray(opposingPosts) && opposingPosts.length > 0
      ? opposingPosts
      : opposingPostId
        ? [{ postId: opposingPostId, description: oppositionReason || '' }]
        : [];

    if (opposingPostsArray.length > 0) {
      console.log('[POST] Creating opposition relationships:', {
        newPostId: savedPost._id,
        opposingPostsCount: opposingPostsArray.length
      });

      if (!savedPost.opposingPosts) savedPost.opposingPosts = [];

      for (const oppData of opposingPostsArray) {
        const targetPostId = oppData.postId;
        const targetDescription = oppData.description || '';

        const opposingPost = await Post.findById(targetPostId).where({
          isDeleted: { $ne: true }
        });

        if (opposingPost) {
          console.log('[POST] Opposing post found:', {
            id: opposingPost._id,
            title: opposingPost.title
          });

          // Prevent self-opposition
          if (opposingPost.journalist.toString() === req.user._id.toString()) {
            console.log('[POST] ⚠️ Skipping self-opposition');
            continue;
          }

          // Add to savedPost.opposingPosts
          savedPost.opposingPosts.push({
            postId: new mongoose.Types.ObjectId(targetPostId),
            description: targetDescription
          });

          // Add to opposingPost.opposedByPosts (bidirectional)
          if (!opposingPost.opposedByPosts) opposingPost.opposedByPosts = [];
          opposingPost.opposedByPosts.push({
            postId: new mongoose.Types.ObjectId(savedPost._id),
            description: targetDescription
          });

          await opposingPost.save();
          console.log('[POST] ✅ Bidirectional opposition saved for post:', targetPostId);
        } else {
          console.log('[POST] ❌ Opposing post not found:', targetPostId);
        }
      }

      await savedPost.save();
      console.log('[POST] ✅ All oppositions saved successfully');
    }

    // Fetch the complete post with journalist information
    let populatedPost = await Post.findById(savedPost._id)
      .populate({
        path: 'journalist',
        select:
          '_id name username avatarUrl specialties isVerified organization journalistRole followers bio'
      })
      .lean();

    // Transform journalist AFTER query
    if (populatedPost && populatedPost.journalist) {
      const j = populatedPost.journalist;
      populatedPost.journalist = {
        _id: j._id,
        id: j._id.toString(),
        name: j.name || j.username || 'Journaliste inconnu',
        username: j.username || j.name || 'unknown',
        avatarUrl: j.avatarUrl && j.avatarUrl.trim() ? buildMediaUrl(req, j.avatarUrl) : null,
        isVerified: j.isVerified || false,
        organization: j.organization || '',
        specialties: j.specialties || [],
        verified: j.isVerified || false
      };
    } else if (populatedPost) {
      populatedPost.journalist = {
        _id: req.user._id,
        id: req.user._id.toString(),
        name: req.user.name || req.user.username || 'Journaliste inconnu',
        avatarUrl: req.user.avatarUrl && req.user.avatarUrl.trim() ? buildMediaUrl(req, req.user.avatarUrl) : null,
        isVerified: req.user.isVerified || false,
        organization: req.user.organization || '',
        specialties: req.user.specialties || []
      };
    }

    // Update journalist's article count
    req.user.stats.postsCount += 1;
    await req.user.save();

    // Invalidate cache after creating a new post
    clearCache('posts');

    console.log('[POST] Post created successfully:', {
      postId: post._id,
      journalistId: req.user._id,
      timestamp: new Date().toISOString()
    });

    res.status(201).json({
      success: true,
      data: populatedPost
    });
  } catch (error) {
    console.error('[POST] Create post error:', {
      journalistId: req.user._id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(400).json({
      success: false,
      message: 'Failed to create post',
      error: error.message
    });
  }
};

exports.getPosts = async (req, res) => {
  console.log('[POST] Get posts request:', {
    query: req.query,
    timestamp: new Date().toISOString()
  });

  try {
    const {
      page = 1,
      limit = 20,
      type,
      status,
      search,
      category,
      domain,
      politicalOrientation,
      politicalView, // Support both parameter names
      sortBy,
      filter,
      authorId,
      voted
    } = req.query;
    const query = {
      isDeleted: { $ne: true }
    };

    console.log('[POST] Initial query:', query);
    console.log('[POST] Type parameter:', type);

    // Apply filter for following
    const followingFilter =
      filter === 'following' || req.query.sort === 'following';
    if (followingFilter && req.user) {
      // Get user's followed journalists
      const user = await User.findById(req.user._id).select(
        'followedJournalists'
      );
      if (
        user &&
        user.followedJournalists &&
        user.followedJournalists.length > 0
      ) {
        query.journalist = { $in: user.followedJournalists };
      } else {
        // If user doesn't follow anyone, return empty result
        return res.json({
          success: true,
          data: {
            posts: [],
            total: 0,
            page: parseInt(page),
            pages: 0
          }
        });
      }
    }

    // Apply filters
    if (type === 'short') {
      // Only get shorts
      query.type = 'short';
    } else if (type === 'video') {
      // Only get regular videos
      query.type = 'video';
    } else if (type === 'posts') {
      // Get all posts except shorts
      query.type = { $ne: 'short' };
    } else if (type) {
      query.type = type;
    }

    console.log(
      '[POST] Query before execution:',
      JSON.stringify(query, null, 2)
    );

    // Default to published posts unless explicitly requested otherwise
    if (status) {
      query.status = status;
    } else if (!req.user || !req.user.isJournalist) {
      // For non-journalists, only show published posts by default
      query.status = 'published';
    }
    if (category || domain) query.domain = category || domain;
    // Support both politicalOrientation and politicalView parameters
    const politicalFilter = politicalOrientation || politicalView;
    // Note: We'll need to filter by dominant view after fetching posts since it's calculated on the fly
    // Store the filter for post-query filtering
    let politicalViewFilter = null;
    if (politicalFilter && politicalFilter !== 'all') {
      politicalViewFilter = politicalFilter;
    }

    // Add authorId filter (support both authorId and journalist params)
    const journalistId = authorId || req.query.journalist;
    if (
      journalistId &&
      journalistId !== 'undefined' &&
      journalistId !== 'null'
    ) {
      // Validate ObjectId format
      if (mongoose.Types.ObjectId.isValid(journalistId)) {
        query.journalist = journalistId;
      } else {
        console.log('[POST] Invalid journalist ID provided:', journalistId);
      }
    }

    // Add voted filter for questions
    if (voted === 'true' && req.user && type === 'question') {
      // This would require checking metadata.question.voters array
      query['metadata.question.voters.userId'] = req.user._id;
    } else if (voted === 'false' && req.user && type === 'question') {
      query['metadata.question.voters.userId'] = { $ne: req.user._id };
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } }
      ];
    }

    // Determine sort criteria
    let sortCriteria = { createdAt: -1 }; // Default to recent
    if (sortBy === 'popular') {
      sortCriteria = { 'stats.views': -1, 'interactions.likes.count': -1 };
    } else if (sortBy === 'trending') {
      // Trending based on recent engagement
      sortCriteria = { 'stats.engagement': -1, createdAt: -1 };
    }

    // Handle 'sort' parameter as alias for 'sortBy' (for mobile compatibility)
    const sortParam = req.query.sort || sortBy;
    if (sortParam === 'recent') {
      sortCriteria = { createdAt: -1 };
    } else if (sortParam === 'foryou') {
      // For "For You" algorithm, we can use engagement or just show recent posts
      sortCriteria = { createdAt: -1 };
    } else if (sortParam === 'trending') {
      sortCriteria = { 'stats.engagement': -1, createdAt: -1 };
    }

    console.log(
      '[POST] Final query before execution:',
      JSON.stringify(query, null, 2)
    );
    console.log('[POST] Sort criteria:', sortCriteria);

    // First, get all banned user IDs
    const bannedUsers = await User.find({ status: 'banned' }).select('_id');
    const bannedUserIds = bannedUsers.map(u => u._id);
    
    // Exclude posts from banned users
    if (bannedUserIds.length > 0) {
      query.journalist = { $nin: bannedUserIds };
    }

    let posts = await Post.find(query)
      .populate({
        path: 'journalist',
        select:
          '_id name username avatarUrl specialties isVerified organization journalistRole status followers bio',
        model: User
      })
      .populate({
        path: 'opposingPosts.postId',
        select: 'title imageUrl',
        model: Post
      })
      .populate({
        path: 'opposedByPosts.postId',
        select: 'title imageUrl',
        model: Post
      })
      .sort(sortCriteria)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    // Transform journalist AFTER query with .lean()
    posts = posts.map(post => {
      if (post.journalist) {
        const j = post.journalist;
        post.journalist = {
          _id: j._id,
          id: j._id.toString(),
          name: j.name || j.username || 'Journaliste inconnu',
          username: j.username || j.name || 'unknown',
          avatarUrl: j.avatarUrl && j.avatarUrl.trim() ? buildMediaUrl(req, j.avatarUrl) : null,
          isVerified: j.isVerified || false,
          organization: j.organization || '',
          specialties: j.specialties || [],
          history: j.bio || '',
          verified: j.isVerified || false
        };
      } else {
        post.journalist = {
          id: null,
          name: 'Journaliste inconnu',
          avatarUrl: null,
          isVerified: false,
          organization: '',
          specialties: []
        };
      }
      return post;
    });

    let total;
    // If we have a political view filter, we need to filter posts after fetching
    // because dominantView is calculated on the fly
    if (politicalViewFilter) {
      // First get all posts without limit to calculate the correct total
      const allPosts = await Post.find(query);
      
      // Filter by dominant political view
      const filteredPosts = allPosts.filter(post => {
        if (!post.politicalOrientation || !post.politicalOrientation.userVotes) {
          return false;
        }
        
        // Calculate dominant view
        let maxVotes = 0;
        let dominantView = 'neutral';
        
        Object.entries(post.politicalOrientation.userVotes).forEach(
          ([view, count]) => {
            if (count > maxVotes) {
              maxVotes = count;
              dominantView = view;
            }
          }
        );
        
        return dominantView === politicalViewFilter;
      });
      
      // Get the total count after filtering
      const filteredTotal = filteredPosts.length;

      // Apply pagination to filtered results
      posts = filteredPosts
        .sort((a, b) => {
          // Apply the same sort criteria
          if (sortCriteria.createdAt) {
            return sortCriteria.createdAt * (new Date(b.createdAt) - new Date(a.createdAt));
          } else if (sortCriteria['stats.engagement']) {
            return sortCriteria['stats.engagement'] * ((b.stats?.engagement || 0) - (a.stats?.engagement || 0));
          }
          return 0;
        })
        .slice((page - 1) * limit, page * limit);

      // Re-populate the posts using .lean()
      const postIds = posts.map(p => p._id);
      posts = await Post.find({ _id: { $in: postIds } })
        .populate({
          path: 'journalist',
          select:
            '_id name username avatarUrl specialties isVerified organization journalistRole status followers bio',
          model: User
        })
        .populate({
          path: 'opposingPosts.postId',
          select: 'title imageUrl',
          model: Post
        })
        .populate({
          path: 'opposedByPosts.postId',
          select: 'title imageUrl',
          model: Post
        })
        .sort(sortCriteria)
        .lean();

      // Transform journalist AFTER query
      posts = posts.map(post => {
        if (post.journalist) {
          const j = post.journalist;
          post.journalist = {
            _id: j._id,
            id: j._id.toString(),
            name: j.name || j.username || 'Journaliste inconnu',
            username: j.username || j.name || 'unknown',
            avatarUrl: j.avatarUrl && j.avatarUrl.trim() ? buildMediaUrl(req, j.avatarUrl) : null,
            isVerified: j.isVerified || false,
            organization: j.organization || '',
            specialties: j.specialties || [],
            history: j.bio || '',
            verified: j.isVerified || false
          };
        }
        return post;
      });

      total = filteredTotal;
    } else {
      // Normal flow without political view filter
      total = await Post.countDocuments(query);
    }

    // Process posts to handle journalist information, URLs, and interactions
    const postsWithAbsoluteUrls = await Promise.all(
      posts.map(async (post) => {
        const postObj = post; // Already plain object from .lean()

        // Ensure _id is always included
        postObj._id = post._id.toString();

        // Simple format for Flutter - use ResponseHelper for consistency
        const userId = req.user?._id;
        postObj.interactions = ResponseHelper.formatInteractions(post, userId);

        // Calculate dominant political view
        if (
          postObj.politicalOrientation &&
          postObj.politicalOrientation.userVotes
        ) {
          let maxVotes = 0;
          let dominantView = 'neutral';
          let totalVotes = 0;

          Object.entries(postObj.politicalOrientation.userVotes).forEach(
            ([view, count]) => {
              totalVotes += count;
              if (count > maxVotes) {
                maxVotes = count;
                dominantView = view;
              }
            }
          );

          postObj.politicalOrientation.dominantView = dominantView;
          postObj.politicalOrientation.totalVotes = totalVotes;
          postObj.politicalOrientation.color =
            getPoliticalViewColor(dominantView);
          
          // Add flag indicating if current user has voted
          postObj.politicalOrientation.hasVoted = ResponseHelper.hasVotedPolitical(post, userId);
        }

        // Handle journalist information
        if (!postObj.journalist) {
          try {
            const journalist = await User.findById(post.journalist);
            if (journalist) {
              postObj.journalist = formatUser(journalist, req, req.user);
            } else {
              postObj.journalist = {
                id: post.journalist,
                name: 'Journaliste inconnu',
                avatarUrl: null,
                isVerified: false,
                organization: '',
                specialties: []
              };
            }
          } catch (err) {
            console.error('Error finding journalist:', err);
            postObj.journalist = formatUser(null, req, req.user);
          }
        } else {
          // Ensure existing journalist object has isFollowing calculated
          postObj.journalist = formatUser(postObj.journalist, req, req.user);
        }

        // Format opposition posts - FILTER OUT non-populated posts
        if (postObj.opposingPosts && Array.isArray(postObj.opposingPosts)) {
          postObj.opposingPosts = postObj.opposingPosts
            .filter(op => op.postId != null && typeof op.postId === 'object' && op.postId._id && op.postId.title)
            .map(op => ({
              postId: op.postId._id.toString(),
              title: op.postId.title,
              imageUrl: op.postId.imageUrl || '',
              description: op.description || ''
            }));
        }

        if (postObj.opposedByPosts && Array.isArray(postObj.opposedByPosts)) {
          postObj.opposedByPosts = postObj.opposedByPosts
            .filter(op => op.postId != null && typeof op.postId === 'object' && op.postId._id && op.postId.title)
            .map(op => ({
              postId: op.postId._id.toString(),
              title: op.postId.title,
              imageUrl: op.postId.imageUrl || '',
              description: op.description || ''
            }));
        }

        // Keep URLs as relative paths
        // For videos, don't set a default imageUrl if thumbnailUrl exists
        if (!postObj.imageUrl && postObj.type !== 'video') {
          postObj.imageUrl = '/uploads/default-post-image.png';
        }
        // videoUrl and thumbnailUrl remain as is (relative paths)

        // journalist avatarUrl is now converted to absolute URL

        return postObj;
      })
    );

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
    console.error('[POST] Get posts error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(400).json({
      success: false,
      message: 'Failed to fetch posts',
      error: error.message
    });
  }
};

exports.searchPosts = async (req, res) => {
  console.log('[POST] Search posts request:', {
    query: req.query,
    timestamp: new Date().toISOString()
  });

  try {
    const {
      search,
      query: searchQuery,
      page = 1,
      limit = 20,
      type,
      domain,
      politicalOrientation,
      politicalView,
      includeRelevance
    } = req.query;

    const searchTerm = search || searchQuery;

    if (!searchTerm || searchTerm.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const queryFilter = {
      isDeleted: { $ne: true },
      status: 'published',
      $or: [
        { title: { $regex: searchTerm, $options: 'i' } },
        { content: { $regex: searchTerm, $options: 'i' } }
      ]
    };

    if (type) {
      if (type === 'short') {
        queryFilter.type = 'short';
      } else if (type === 'video') {
        queryFilter.type = 'video';
      } else if (type === 'posts') {
        queryFilter.type = { $ne: 'short' };
      } else {
        queryFilter.type = type;
      }
    }

    if (domain) {
      queryFilter.domain = domain;
    }

    const politicalFilter = politicalOrientation || politicalView;
    let politicalViewFilter = null;
    if (politicalFilter && politicalFilter !== 'all') {
      politicalViewFilter = politicalFilter;
    }

    const bannedUsers = await User.find({ status: 'banned' }).select('_id');
    const bannedUserIds = bannedUsers.map(u => u._id);

    if (bannedUserIds.length > 0) {
      queryFilter.journalist = { $nin: bannedUserIds };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    let posts = await Post.find(queryFilter)
      .populate({
        path: 'journalist',
        select: '_id name username avatarUrl specialties isVerified organization journalistRole status followers bio',
        model: User
      })
      .populate({
        path: 'opposingPosts.post',
        select: 'title journalist',
        populate: {
          path: 'journalist',
          select: '_id name avatarUrl isVerified username followers'
        }
      })
      .sort({ 'stats.views': -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Transform journalist AFTER query
    posts = posts.map(post => {
      if (post.journalist) {
        const j = post.journalist;
        post.journalist = {
          _id: j._id,
          id: j._id.toString(),
          name: j.name || j.username || 'Journaliste inconnu',
          username: j.username || j.name || 'unknown',
          avatarUrl: j.avatarUrl && j.avatarUrl.trim() ? buildMediaUrl(req, j.avatarUrl) : null,
          isVerified: j.isVerified || false,
          organization: j.organization || '',
          specialties: j.specialties || []
        };
      } else {
        post.journalist = {
          id: null,
          name: 'Journaliste inconnu',
          avatarUrl: null,
          isVerified: false,
          organization: '',
          specialties: []
        };
      }
      return post;
    });

    if (politicalViewFilter) {
      posts = posts.filter(post => {
        const dominantView = post.politicalOrientation?.dominantView;
        return dominantView && dominantView.toLowerCase() === politicalViewFilter.toLowerCase();
      });
    }

    const total = await Post.countDocuments(queryFilter);

    const formattedPosts = posts.map(post => {
      const postObj = {
        id: post._id.toString(),
        title: post.title,
        content: post.content,
        type: post.type,
        domain: post.domain,
        status: post.status,
        journalist: post.journalist,
        videoUrl: post.videoUrl ? buildMediaUrl(req, post.videoUrl) : null,
        audioUrl: post.audioUrl ? buildMediaUrl(req, post.audioUrl) : null,
        imageUrl: post.imageUrl ? buildMediaUrl(req, post.imageUrl) : null,
        thumbnailUrl: post.thumbnailUrl ? buildMediaUrl(req, post.thumbnailUrl) : null,
        stats: post.stats || { views: 0, shares: 0, engagement: 0 },
        interactions: {
          likes: post.interactions?.likes?.count || 0,
          dislikes: post.interactions?.dislikes?.count || 0,
          saves: post.interactions?.saves?.count || 0,
          comments: post.interactions?.comments?.count || 0,
          shares: post.stats?.shares || 0
        },
        politicalOrientation: post.politicalOrientation,
        opposingPosts: post.opposingPosts || [],
        createdAt: post.createdAt,
        updatedAt: post.updatedAt
      };

      if (post.type === 'question' && post.metadata?.question) {
        postObj.question = {
          options: post.metadata.question.options || [],
          totalVotes: post.metadata.question.totalVotes || 0,
          voters: post.metadata.question.voters || []
        };
      }

      if (req.user) {
        postObj.hasLiked = post.interactions?.likes?.users?.some(
          id => id.toString() === req.user._id.toString()
        ) || false;
        postObj.hasDisliked = post.interactions?.dislikes?.users?.some(
          id => id.toString() === req.user._id.toString()
        ) || false;
        postObj.hasSaved = post.interactions?.saves?.users?.some(
          id => id.toString() === req.user._id.toString()
        ) || false;
      }

      if (includeRelevance === 'true') {
        const titleMatch = post.title.toLowerCase().includes(searchTerm.toLowerCase());
        const contentMatch = post.content?.toLowerCase().includes(searchTerm.toLowerCase());
        postObj.relevanceScore = (titleMatch ? 2 : 0) + (contentMatch ? 1 : 0);
      }

      return postObj;
    });

    console.log('[POST] Search complete:', {
      query: searchTerm,
      found: formattedPosts.length,
      total,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: {
        posts: formattedPosts,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('[POST] Search error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(400).json({
      success: false,
      message: 'Failed to search posts',
      error: error.message
    });
  }
};

exports.getPost = async (req, res) => {
  console.log('[POST] Get post request:', {
    postId: req.params.id,
    userId: req.user?._id,
    timestamp: new Date().toISOString()
  });

  try {
    // Validate MongoDB ObjectId format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      console.log('[POST] Invalid ObjectId format:', req.params.id);
      return res.status(400).json({
        success: false,
        message: 'Invalid post ID format'
      });
    }

    const post = await Post.findById(req.params.id)
      .where({ isDeleted: { $ne: true } })
      .populate({
        path: 'journalist',
        select:
          '_id name username avatarUrl specialties isVerified organization journalistRole status bio',
        model: User
      })
      .populate({
        path: 'opposingPosts.postId',
        select: 'title imageUrl',
        model: Post
      })
      .populate({
        path: 'opposedByPosts.postId',
        select: 'title imageUrl',
        model: Post
      });

    if (!post) {
      console.log('[POST] Get post failed: Post not found:', {
        postId: req.params.id
      });
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Check if the author is banned
    if (post.journalist && post.journalist.status === 'banned') {
      console.log('[POST] Get post failed: Author is banned:', {
        postId: req.params.id,
        authorId: post.journalist._id
      });
      return res.status(403).json({
        success: false,
        message: 'This content is no longer available'
      });
    }

    // Increment view count
    post.stats.views += 1;
    await post.save();

    // Add to user's read history if authenticated
    if (req.user && !req.isJournalist) {
      await req.user.addToReadHistory(post._id);
      console.log('[POST] Added to user read history:', {
        userId: req.user._id,
        postId: post._id
      });
    }

    console.log('[POST] Post fetched successfully:', {
      postId: post._id,
      views: post.stats.views,
      timestamp: new Date().toISOString()
    });

    // Convert to plain object and transform journalist
    const postObj = post.toObject();

    // Transform journalist AFTER converting to plain object
    if (postObj.journalist) {
      const j = postObj.journalist;
      postObj.journalist = {
        _id: j._id,
        id: j._id.toString(),
        name: j.name || j.username || 'Journaliste inconnu',
        username: j.username || j.name || 'unknown',
        avatarUrl: j.avatarUrl && j.avatarUrl.trim() ? buildMediaUrl(req, j.avatarUrl) : null,
        isVerified: j.isVerified || false,
        organization: j.organization || '',
        specialties: j.specialties || [],
        verified: j.isVerified || false
      };
    } else {
      postObj.journalist = {
        id: null,
        name: 'Journaliste inconnu',
        avatarUrl: null,
        isVerified: false,
        organization: '',
        specialties: []
      };
    }

    // Ensure _id is always included
    postObj._id = post._id.toString();

    // Simple format for Flutter - use ResponseHelper for consistency
    postObj.interactions = ResponseHelper.formatInteractions(post, req.user?._id);

    // Calculate dominant political view
    if (
      postObj.politicalOrientation &&
      postObj.politicalOrientation.userVotes
    ) {
      let maxVotes = 0;
      let dominantView = 'neutral';
      let totalVotes = 0;

      Object.entries(postObj.politicalOrientation.userVotes).forEach(
        ([view, count]) => {
          totalVotes += count;
          if (count > maxVotes) {
            maxVotes = count;
            dominantView = view;
          }
        }
      );

      postObj.politicalOrientation.dominantView = dominantView;
      postObj.politicalOrientation.totalVotes = totalVotes;
      postObj.politicalOrientation.color = getPoliticalViewColor(dominantView);
      
      // Add flag indicating if current user has voted
      postObj.politicalOrientation.hasVoted = ResponseHelper.hasVotedPolitical(post, req.user?._id);
    }

    // Keep URLs as relative paths
    // For videos, don't set a default imageUrl if thumbnailUrl exists
    if (!postObj.imageUrl && postObj.type !== 'video') {
      postObj.imageUrl = '/uploads/default-post-image.png';
    }
    // videoUrl and thumbnailUrl remain as is (relative paths)

    // journalist.avatarUrl remains as is (relative path)

    // Format opposition posts
    console.log('[POST] opposedByPosts BEFORE:', JSON.stringify(postObj.opposedByPosts?.slice(0, 2)));

    if (postObj.opposingPosts && Array.isArray(postObj.opposingPosts)) {
      postObj.opposingPosts = postObj.opposingPosts
        .filter(op => op.postId != null && op.postId._id && op.postId.title)
        .map(op => ({
          postId: op.postId._id?.toString() || op.postId.toString(),
          title: op.postId.title || '',
          imageUrl: op.postId.imageUrl || '',
          description: op.description || ''
        }));
    }

    if (postObj.opposedByPosts && Array.isArray(postObj.opposedByPosts)) {
      console.log('[POST] opposedByPosts filtering - original count:', postObj.opposedByPosts.length);
      postObj.opposedByPosts.forEach((op, idx) => {
        console.log(`[POST] opposedByPosts[${idx}]:`, {
          hasPostId: !!op.postId,
          postIdType: typeof op.postId,
          hasId: op.postId?._id !== undefined,
          hasTitle: op.postId?.title !== undefined,
          postIdValue: op.postId
        });
      });

      postObj.opposedByPosts = postObj.opposedByPosts
        .filter(op => {
          const isValid = op.postId != null && typeof op.postId === 'object' && op.postId._id && op.postId.title;
          console.log(`[POST] Filter result for ${op.postId?._id || 'unknown'}: ${isValid}`);
          return isValid;
        })
        .map(op => ({
          postId: op.postId._id.toString(),
          title: op.postId.title,
          imageUrl: op.postId.imageUrl || '',
          description: op.description || ''
        }));
      console.log('[POST] opposedByPosts AFTER filtering - count:', postObj.opposedByPosts.length);
      console.log('[POST] opposedByPosts AFTER:', JSON.stringify(postObj.opposedByPosts));
    }

    res.json({
      success: true,
      data: postObj
    });
  } catch (error) {
    console.error('[POST] Get post error:', {
      postId: req.params.id,
      userId: req.user?._id,
      userRole: req.user?.role,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    // Return 404 if post not found, 400 for other errors
    const status = error.message?.includes('not found') || error.name === 'CastError' ? 404 : 400;

    res.status(status).json({
      success: false,
      message: 'Failed to fetch post',
      error: error.message
    });
  }
};

exports.updatePost = async (req, res) => {
  console.log('[POST] Update post attempt:', {
    postId: req.params.id,
    journalistId: req.user._id,
    updates: Object.keys(req.body),
    timestamp: new Date().toISOString()
  });

  try {
    const post = await Post.findById(req.params.id).where({
      isDeleted: { $ne: true }
    });

    if (!post) {
      console.log('[POST] Update post failed: Post not found:', {
        postId: req.params.id
      });
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Check ownership
    if (post.journalist.toString() !== req.user._id.toString()) {
      console.log('[POST] Update post failed: Not authorized:', {
        postId: req.params.id,
        journalistId: req.user._id,
        postJournalistId: post.journalist
      });
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this post'
      });
    }

    const updates = Object.keys(req.body);
    const allowedUpdates = [
      'title',
      'content',
      'imageUrl',
      'videoUrl',
      'type',
      'status',
      'publicOpinion',
      'opposingPosts',
      'opposedByPosts'
    ];

    const isValidOperation = updates.every((update) =>
      allowedUpdates.includes(update)
    );

    if (!isValidOperation) {
      console.log('[POST] Update post failed: Invalid updates:', {
        postId: req.params.id,
        invalidUpdates: updates.filter(
          (update) => !allowedUpdates.includes(update)
        )
      });
      return res.status(400).json({
        success: false,
        message: 'Invalid updates'
      });
    }

    updates.forEach((update) => {
      post[update] = req.body[update];
    });

    await post.save();

    console.log('[POST] Post updated successfully:', {
      postId: post._id,
      updates,
      timestamp: new Date().toISOString()
    });

    // Invalidate cache after updating a post
    clearCache('posts');

    res.json({
      success: true,
      data: post
    });
  } catch (error) {
    console.error('[POST] Update post error:', {
      postId: req.params.id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(400).json({
      success: false,
      message: 'Failed to update post',
      error: error.message
    });
  }
};

exports.deletePost = async (req, res) => {
  console.log('[POST] Delete post attempt:', {
    postId: req.params.id,
    journalistId: req.user._id,
    timestamp: new Date().toISOString()
  });

  try {
    const post = await Post.findById(req.params.id).where({
      isDeleted: { $ne: true }
    });

    if (!post) {
      console.log('[POST] Delete post failed: Post not found:', {
        postId: req.params.id
      });
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Check ownership
    if (post.journalist.toString() !== req.user._id.toString()) {
      console.log('[POST] Delete post failed: Not authorized:', {
        postId: req.params.id,
        journalistId: req.user._id,
        postJournalistId: post.journalist
      });
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this post'
      });
    }

    // Soft delete instead of hard delete
    post.isDeleted = true;
    post.deletedAt = new Date();
    post.status = 'deleted';
    await post.save();

    // Update journalist's article count
    req.user.stats.postsCount -= 1;
    await req.user.save();

    console.log('[POST] Post deleted successfully:', {
      postId: req.params.id,
      timestamp: new Date().toISOString()
    });

    // Invalidate cache after deleting a post
    clearCache('posts');

    res.json({
      success: true,
      message: 'Post deleted successfully'
    });
  } catch (error) {
    console.error('[POST] Delete post error:', {
      postId: req.params.id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(400).json({
      success: false,
      message: 'Failed to delete post',
      error: error.message
    });
  }
};

exports.checkDuplicate = async (req, res) => {
  console.log('[POST] Check duplicate attempt:', {
    title: req.query.title,
    hash: req.query.hash,
    timestamp: new Date().toISOString()
  });

  try {
    const { title, hash } = req.query;

    if (!title && !hash) {
      return res.status(400).json({
        success: false,
        message: 'Title or hash parameter is required'
      });
    }

    let existingPost = null;
    let similarPosts = [];

    if (hash) {
      existingPost = await Post.findOne({
        'metadata.video.hash': hash,
        isDeleted: { $ne: true }
      });
    } else if (title) {
      // Check for exact title match
      existingPost = await Post.findOne({
        title: { $regex: new RegExp(`^${title}$`, 'i') },
        isDeleted: { $ne: true }
      });

      // Find similar posts
      similarPosts = await Post.find({
        title: { $regex: title, $options: 'i' },
        isDeleted: { $ne: true }
      })
        .limit(5)
        .select('title type journalist createdAt');
    }

    console.log('[POST] Check duplicate completed:', {
      title,
      hash,
      isDuplicate: !!existingPost,
      similarCount: similarPosts.length,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      isDuplicate: !!existingPost,
      similarPosts: similarPosts
    });
  } catch (error) {
    console.error('[POST] Check duplicate error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(400).json({
      success: false,
      message: 'Failed to check for duplicates',
      error: error.message
    });
  }
};

exports.interactWithPost = async (req, res) => {
  const mongoose = require('mongoose');

  console.log('[POST] Interaction attempt:', {
    postId: req.params.id,
    userId: req.user?._id,
    type: req.body.type,
    action: req.body.action,
    payload: req.body,
    timestamp: new Date().toISOString()
  });

  try {
    // Validate post ID format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      console.log('[POST] Invalid post ID format:', req.params.id);
      return res.status(400).json({
        success: false,
        message: 'Invalid post ID format'
      });
    }

    // Validate user authentication
    if (!req.user || !req.user._id) {
      console.log('[POST] User not authenticated for interaction');
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const { type, action } = req.body;
    const post = await Post.findById(req.params.id).where({
      isDeleted: { $ne: true }
    });
    if (!post) {
      console.log('[POST] Interaction failed: Post not found:', {
        postId: req.params.id
      });
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Log the current state before modification
    console.log('[POST] Current post state before interaction:', {
      postId: post._id,
      userId: req.user._id,
      type,
      action,
      currentLikes: post.interactions?.likes?.count || 0,
      currentBookmarks: post.interactions?.bookmarks?.count || 0,
      currentComments: post.interactions?.comments?.count || 0,
      politicalVotes: post.politicalOrientation?.userVotes,
      timestamp: new Date().toISOString()
    });

    // Load the full user document for bookmark operations
    let user = req.user;
    if (type === 'bookmark') {
      const User = require('../models/user.model');
      user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      // Initialize interactions.savedPosts if it doesn't exist
      if (!user.interactions) {
        user.interactions = {};
      }
      if (!user.interactions.savedPosts) {
        user.interactions.savedPosts = [];
      }
    }

    const actionAdd = action === 'add';

    switch (type) {
    case 'like': {
      // Handle like interaction
      const userIdStr = user._id.toString();

      console.log('[POST] ❤️ Processing LIKE interaction:', {
        postId: post._id,
        userId: userIdStr,
        action: actionAdd ? 'ADD' : 'REMOVE',
        timestamp: new Date().toISOString()
      });

      // Initialize likes if it doesn't exist
      if (!post.interactions.likes) {
        console.log('[POST] ⚠️ Initializing likes object');
        post.interactions.likes = { users: [], count: 0 };
      }
      if (!Array.isArray(post.interactions.likes.users)) {
        console.log('[POST] ⚠️ Initializing likes.users array');
        post.interactions.likes.users = [];
      }

      const hasLiked = post.interactions.likes.users.some(
        (u) => u.user && u.user.toString() === userIdStr
      );

      console.log('[POST] 🔍 Like status check:', {
        postId: post._id,
        userId: userIdStr,
        hasLiked,
        currentLikesCount: post.interactions.likes.count,
        likesUsersCount: post.interactions.likes.users.length,
        actionAdd,
        timestamp: new Date().toISOString()
      });

      if (actionAdd && !hasLiked) {
        console.log('[POST] ➕ Adding like to post');
        post.interactions.likes.users.push({
          user: user._id,
          createdAt: new Date()
        });
        post.interactions.likes.count =
            (post.interactions.likes.count || 0) + 1;

        console.log('[POST] ✅ Like added successfully:', {
          postId: post._id,
          userId: userIdStr,
          newLikesCount: post.interactions.likes.count,
          newLikesUsersCount: post.interactions.likes.users.length,
          timestamp: new Date().toISOString()
        });

        // Create notification for post owner (only if journalist exists)
        if (post.journalist) {
          await NotificationService.notifyLike(
            post._id,
            user._id,
            post.journalist
          );
        }
      } else if (!actionAdd && hasLiked) {
        console.log('[POST] ➖ Removing like from post');
        post.interactions.likes.users = post.interactions.likes.users.filter(
          (u) => u.user && u.user.toString() !== userIdStr
        );
        post.interactions.likes.count = Math.max(
          0,
          (post.interactions.likes.count || 1) - 1
        );

        console.log('[POST] ✅ Like removed successfully:', {
          postId: post._id,
          userId: userIdStr,
          newLikesCount: post.interactions.likes.count,
          newLikesUsersCount: post.interactions.likes.users.length,
          timestamp: new Date().toISOString()
        });
      } else {
        console.log('[POST] ⚠️ No action taken - already in desired state:', {
          postId: post._id,
          userId: userIdStr,
          hasLiked,
          actionAdd,
          timestamp: new Date().toISOString()
        });
      }
      break;
    }

    case 'bookmark': {
      // Update user's saved posts and post's bookmarks
      const userIdStr = user._id.toString();
      // Initialize bookmarks if it doesn't exist
      if (!post.interactions.bookmarks) {
        post.interactions.bookmarks = { users: [], count: 0 };
      }
      if (!Array.isArray(post.interactions.bookmarks.users)) {
        post.interactions.bookmarks.users = [];
      }

      const hasBookmarked = post.interactions.bookmarks.users.some(
        (u) => u.user && u.user.toString() === userIdStr
      );
      if (actionAdd && !hasBookmarked) {
        post.interactions.bookmarks.users.push({
          user: user._id,
          createdAt: new Date()
        });
        post.interactions.bookmarks.count =
            (post.interactions.bookmarks.count || 0) + 1;
        // Add to user's savedPosts if not already there
        if (
          !user.interactions.savedPosts.some(
            (id) => id.toString() === post._id.toString()
          )
        ) {
          user.interactions.savedPosts.push(post._id);
        }
      } else if (!actionAdd && hasBookmarked) {
        post.interactions.bookmarks.users =
            post.interactions.bookmarks.users.filter(
              (u) => u.user && u.user.toString() !== userIdStr
            );
        post.interactions.bookmarks.count = Math.max(
          0,
          (post.interactions.bookmarks.count || 1) - 1
        );
        // Remove from user's savedPosts
        user.interactions.savedPosts = user.interactions.savedPosts.filter(
          (id) => id.toString() !== post._id.toString()
        );
      }
      break;
    }

    case 'comment': {
      // Update post's comments
      const userIdStr = user._id.toString();
      // Initialize comments if it doesn't exist
      if (!post.interactions.comments) {
        post.interactions.comments = { users: [], count: 0 };
      }
      if (!Array.isArray(post.interactions.comments.users)) {
        post.interactions.comments.users = [];
      }

      const hasCommented = post.interactions.comments.users.some(
        (u) => u.user && u.user.toString() === userIdStr
      );
      if (actionAdd && !hasCommented) {
        post.interactions.comments.users.push({
          user: user._id,
          createdAt: new Date()
        });
        post.interactions.comments.count =
            (post.interactions.comments.count || 0) + 1;
      } else if (!actionAdd && hasCommented) {
        post.interactions.comments.users =
            post.interactions.comments.users.filter(
              (u) => u.user && u.user.toString() !== userIdStr
            );
        post.interactions.comments.count = Math.max(
          0,
          (post.interactions.comments.count || 1) - 1
        );
      }
      break;
    }

    case 'political-view':
    case 'vote_orientation': {
      // For political view, the orientation is passed in 'action' field from Flutter
      const view = req.body.view || req.body.action;
      console.log('[POST] Political view vote:', {
        postId: post._id,
        userId: user._id,
        view: view,
        currentVotes: post.politicalOrientation?.userVotes,
        timestamp: new Date().toISOString()
      });

      if (!view) {
        return res.status(400).json({
          success: false,
          message: 'Political view is required'
        });
      }
      // Force action to 'add' for political views
      const politicalActionAdd = true;

      // Initialize political orientation if not exists
      if (!post.politicalOrientation) {
        post.politicalOrientation = {
          userVotes: {
            extremely_conservative: 0,
            conservative: 0,
            neutral: 0,
            progressive: 0,
            extremely_progressive: 0
          },
          journalistChoice: 'neutral',
          finalScore: 0
        };
      }

      // Initialize political votes tracking on the post itself
      if (!post.politicalOrientation.voters) {
        post.politicalOrientation.voters = [];
      }

      // Check if user already voted
      const existingVoteIndex = post.politicalOrientation.voters.findIndex(
        (voter) => voter.userId.toString() === user._id.toString()
      );

      let previousView = null;
      if (existingVoteIndex !== -1) {
        previousView =
            post.politicalOrientation.voters[existingVoteIndex].view;

        // Remove previous vote if different
        if (previousView !== view) {
          post.politicalOrientation.userVotes[previousView] = Math.max(
            0,
            post.politicalOrientation.userVotes[previousView] - 1
          );
          // Remove the voter entry
          post.politicalOrientation.voters.splice(existingVoteIndex, 1);
        } else {
          // Same vote, no change needed
          break;
        }
      }

      // Update vote count
      if (politicalActionAdd) {
        post.politicalOrientation.userVotes[view] =
            (post.politicalOrientation.userVotes[view] || 0) + 1;

        // Add voter record
        post.politicalOrientation.voters.push({
          userId: user._id,
          view: view,
          votedAt: new Date()
        });

      }
      
      // Reverse mapping for result
      const viewMapping = {
        '-2': 'extremely_conservative',
        '-1': 'conservative',
        '0': 'neutral',
        '1': 'progressive',
        '2': 'extremely_progressive'
      };
        
      // Build frequency table
      const frequencies = [-2, -1, 0, 1, 2].map(score => {
        const view = viewMapping[score.toString()];
        return post.politicalOrientation.userVotes[view] || 0;
      });
        
      // Calculate total votes
      const totalVotes = frequencies.reduce((sum, freq) => sum + freq, 0);
        
      // Find median using cumulative frequencies
      let median = 0; // Default to neutral if no votes
      if (totalVotes > 0) {
        // For even number of votes, if median falls between two values, we need to handle it
        const medianPosition = totalVotes / 2;
        let cumulative = 0;
        let medianIndex = -1;
          
        // Find the index where cumulative count exceeds median position
        for (let i = 0; i < frequencies.length; i++) {
          cumulative += frequencies[i];
          if (cumulative > medianPosition) {
            medianIndex = i;
            break;
          } else if (cumulative === medianPosition && totalVotes % 2 === 0) {
            // For even total, if we're exactly at the median position
            // Find the next non-zero frequency
            for (let j = i + 1; j < frequencies.length; j++) {
              if (frequencies[j] > 0) {
                // Average of two middle values
                const score1 = i - 2;
                const score2 = j - 2;
                const avgScore = (score1 + score2) / 2;
                // Round towards 0 (neutral) for ties
                median = avgScore > 0 ? Math.floor(avgScore) : Math.ceil(avgScore);
                medianIndex = -2; // Flag to skip the main assignment
                break;
              }
            }
            if (medianIndex === -1) {
              // No more votes after this point, use current index
              medianIndex = i;
            }
            break;
          }
        }
          
        if (medianIndex >= 0) {
          median = medianIndex - 2; // Convert index to score (-2 to +2)
        }
      }
        
      // Update dominant view based on median
      post.politicalOrientation.journalistChoice = viewMapping[median.toString()];
      post.politicalOrientation.finalScore = median;
      break;
    }

    default:
      console.log('[POST] Interaction failed: Invalid type:', {
        postId: req.params.id,
        type
      });
      return res.status(400).json({
        success: false,
        message: 'Invalid interaction type'
      });
    }

    // Save post always, save user only if it was modified
    const savePromises = [post.save()];

    // Only save user if it was modified (for bookmark interactions)
    if (type === 'bookmark') {
      savePromises.push(user.save());
    }

    // Execute saves and verify persistence
    await Promise.all(savePromises);

    // Invalidate cache after interaction to ensure fresh data
    clearCache('posts');

    // Verify the save was successful by re-fetching from DB
    const verifyPost = await Post.findById(post._id);
    console.log('[POST] Interaction saved and verified:', {
      postId: post._id,
      userId: req.user._id,
      type,
      action,
      beforeSave: {
        likesCount: post.interactions.likes?.count,
        bookmarksCount: post.interactions.bookmarks?.count,
        politicalVotes:
          type === 'political-view'
            ? post.politicalOrientation.userVotes
            : undefined
      },
      afterSave: {
        likesCount: verifyPost.interactions.likes?.count,
        bookmarksCount: verifyPost.interactions.bookmarks?.count,
        politicalVotes:
          type === 'political-view'
            ? verifyPost.politicalOrientation.userVotes
            : undefined
      },
      persistenceCheck: {
        likesMatch:
          post.interactions.likes?.count ===
          verifyPost.interactions.likes?.count,
        bookmarksMatch:
          post.interactions.bookmarks?.count ===
          verifyPost.interactions.bookmarks?.count
      },
      timestamp: new Date().toISOString()
    });

    // For like/dislike endpoints, prepare the response with full post data
    if (type === 'like') {
      const userId = req.user._id.toString();

      // Populate journalist for the response
      await verifyPost.populate({
        path: 'journalist',
        select:
          '_id name username avatarUrl specialties isVerified organization journalistRole followers bio'
      });

      // Transform journalist manually
      if (verifyPost.journalist) {
        const j = verifyPost.journalist;
        const journalistObj = j; // Already plain object from populate
        verifyPost.journalist = {
          _id: journalistObj._id,
          id: journalistObj._id.toString(),
          name: journalistObj.name || journalistObj.username || 'Journaliste inconnu',
          username: journalistObj.username || journalistObj.name || 'unknown',
          avatarUrl: journalistObj.avatarUrl && journalistObj.avatarUrl.trim() ? buildMediaUrl(req, journalistObj.avatarUrl) : null,
          isVerified: journalistObj.isVerified || false,
          organization: journalistObj.organization || '',
          specialties: journalistObj.specialties || [],
          history: journalistObj.bio || '',
          verified: journalistObj.isVerified || false
        };
      } else {
        verifyPost.journalist = {
          id: verifyPost.journalist,
          name: 'Journaliste inconnu',
          avatarUrl: null,
          isVerified: false,
          organization: '',
          specialties: []
        };
      }

      // Return full post data for Flutter app
      const responsePost = verifyPost; // Already plain object
      responsePost._id = verifyPost._id ? verifyPost._id.toString() : verifyPost._id;

      // Initialize dislikes if it doesn't exist (for response)
      if (!verifyPost.interactions.dislikes) {
        verifyPost.interactions.dislikes = { users: [], count: 0 };
      }

      // Format interactions to match Flutter model expectations - use ResponseHelper
      responsePost.interactions = ResponseHelper.formatInteractions(verifyPost, userId);

      // Keep URLs as relative paths
      // For videos, don't set a default imageUrl if thumbnailUrl exists
      if (!responsePost.imageUrl && responsePost.type !== 'video') {
        responsePost.imageUrl = '/uploads/default-post-image.png';
      }
      // videoUrl and thumbnailUrl remain as is (relative paths)
      
      // journalist.avatarUrl remains as is (relative path)

      res.json({
        success: true,
        data: responsePost
      });
      return;
    }

    // For political view endpoint, return full post data for consistency
    if (type === 'political-view' || type === 'vote_orientation') {
      // Re-fetch the post to get the latest data
      let updatedPost = await Post.findById(post._id)
        .populate({
          path: 'journalist',
          select:
            '_id name username avatarUrl specialties isVerified organization journalistRole followers bio'
        })
        .lean();

      // Transform journalist manually
      if (updatedPost && updatedPost.journalist) {
        const j = updatedPost.journalist;
        updatedPost.journalist = {
          _id: j._id,
          id: j._id.toString(),
          name: j.name || j.username || 'Journaliste inconnu',
          username: j.username || j.name || 'unknown',
          avatarUrl: j.avatarUrl && j.avatarUrl.trim() ? buildMediaUrl(req, j.avatarUrl) : null,
          isVerified: j.isVerified || false,
          organization: j.organization || '',
          specialties: j.specialties || [],
          history: j.bio || '',
          verified: j.isVerified || false
        };
      } else if (updatedPost) {
        updatedPost.journalist = {
          id: post.journalist,
          name: 'Journaliste inconnu',
          avatarUrl: null,
          isVerified: false,
          organization: '',
          specialties: []
        };
      }

      // Calculate dominant view
      let maxVotes = 0;
      let dominantView = 'neutral';
      let totalVotes = 0;

      Object.entries(updatedPost.politicalOrientation.userVotes).forEach(
        ([view, count]) => {
          totalVotes += count;
          if (count > maxVotes) {
            maxVotes = count;
            dominantView = view;
          }
        }
      );

      const responsePost = updatedPost; // Already plain object from .lean()
      responsePost._id = updatedPost._id ? updatedPost._id.toString() : updatedPost._id;

      // Add calculated fields
      responsePost.politicalOrientation.dominantView = dominantView;
      responsePost.politicalOrientation.totalVotes = totalVotes;
      responsePost.politicalOrientation.color =
        getPoliticalViewColor(dominantView);
      
      // Add flag indicating if current user has voted
      responsePost.politicalOrientation.hasVoted = ResponseHelper.hasVotedPolitical(updatedPost, req.user._id);

      // Format interactions to match Flutter model expectations - SIMPLE INTEGERS
      responsePost.interactions = {
        likes: updatedPost.interactions.likes?.count || 0,
        dislikes: updatedPost.interactions.dislikes?.count || 0,
        comments: updatedPost.interactions.comments?.count || 0,
        reports: updatedPost.interactions.reports?.count || 0,
        bookmarks: updatedPost.interactions.bookmarks?.count || 0,
        isLiked:
          updatedPost.interactions.likes?.users?.some(
            (u) => u.user && u.user.toString() === req.user._id.toString()
          ) || false,
        isBookmarked:
          updatedPost.interactions.bookmarks?.users?.some(
            (u) => u.user && u.user.toString() === req.user._id.toString()
          ) || false,
        isSaved:
          updatedPost.interactions.bookmarks?.users?.some(
            (u) => u.user && u.user.toString() === req.user._id.toString()
          ) || false
      };

      // Keep URLs as relative paths
      // For videos, don't set a default imageUrl if thumbnailUrl exists
      if (!responsePost.imageUrl && responsePost.type !== 'video') {
        responsePost.imageUrl = '/uploads/default-post-image.png';
      }
      // videoUrl and thumbnailUrl remain as is (relative paths)
      
      // journalist.avatarUrl remains as is (relative path)

      console.log('[POST] Political view vote result:', {
        postId: updatedPost._id,
        dominantView,
        totalVotes,
        distribution: updatedPost.politicalOrientation.userVotes,
        timestamp: new Date().toISOString()
      });

      res.json({
        success: true,
        data: responsePost
      });
      return;
    }

    // For other interactions, return full post response
    // Need to populate journalist field
    await post.populate({
      path: 'journalist',
      select:
        '_id name username avatarUrl specialties isVerified organization journalistRole bio'
    });

    // Transform journalist manually
    if (post.journalist) {
      const j = post.journalist;
      const journalistObj = j; // Already plain object from populate
      post.journalist = {
        _id: journalistObj._id,
        id: journalistObj._id.toString(),
        name: journalistObj.name || journalistObj.username || 'Journaliste inconnu',
        username: journalistObj.username || journalistObj.name || 'unknown',
        avatarUrl: journalistObj.avatarUrl && journalistObj.avatarUrl.trim() ? buildMediaUrl(req, journalistObj.avatarUrl) : null,
        isVerified: journalistObj.isVerified || false,
        organization: journalistObj.organization || '',
        specialties: journalistObj.specialties || [],
        history: journalistObj.bio || '',
        verified: journalistObj.isVerified || false
      };
    } else {
      post.journalist = {
        id: post.journalist,
        name: 'Journaliste inconnu',
        avatarUrl: null,
        isVerified: false,
        organization: '',
        specialties: []
      };
    }

    const responsePost = post; // Already plain object

    // Ensure _id is always included
    responsePost._id = post._id ? post._id.toString() : post._id;

    // Format interactions to match Flutter model expectations - SIMPLE INTEGERS
    responsePost.interactions = {
      likes: post.interactions.likes?.count || 0,
      dislikes: post.interactions.dislikes?.count || 0,
      comments: post.interactions.comments?.count || 0,
      reports: post.interactions.reports?.count || 0,
      bookmarks: post.interactions.bookmarks?.count || 0,
      isLiked:
        post.interactions.likes?.users?.some(
          (u) => u.user && u.user.toString() === req.user._id.toString()
        ) || false,
      isBookmarked:
        post.interactions.bookmarks?.users?.some(
          (u) => u.user && u.user.toString() === req.user._id.toString()
        ) || false,
      isSaved:
        post.interactions.bookmarks?.users?.some(
          (u) => u.user && u.user.toString() === req.user._id.toString()
        ) || false
    };

    // Keep URLs as relative paths
    // For videos, don't set a default imageUrl if thumbnailUrl exists
    if (!responsePost.imageUrl && responsePost.type !== 'video') {
      responsePost.imageUrl = '/uploads/default-post-image.png';
    }
    // videoUrl and thumbnailUrl remain as is (relative paths)
    
    // journalist.avatarUrl remains as is (relative path)

    console.log('[POST] Interaction processed successfully:', {
      postId: post._id,
      type,
      action,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: responsePost
    });
  } catch (error) {
    console.error('[POST] Interaction error:', {
      postId: req.params.id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(400).json({
      success: false,
      message: 'Failed to process interaction',
      error: error.message
    });
  }
};

exports.addOpposition = async (req, res) => {
  try {
    const { postId } = req.params;
    const { opposingPostId, description } = req.body;

    if (!postId || !opposingPostId) {
      return res.status(400).json({
        success: false,
        message: 'Both postId and opposingPostId are required'
      });
    }

    const [post, opposingPost] = await Promise.all([
      Post.findById(postId),
      Post.findById(opposingPostId)
    ]);

    if (!post || !opposingPost) {
      return res.status(404).json({
        success: false,
        message: 'One or both posts not found'
      });
    }

    // Add opposition relationship in both directions
    if (!post.opposingPosts) post.opposingPosts = [];
    if (!opposingPost.opposedByPosts) opposingPost.opposedByPosts = [];

    // Check if opposition already exists
    const oppositionExists = post.opposingPosts.some(
      (op) => op.toString() === opposingPostId
    );

    if (!oppositionExists) {
      post.opposingPosts.push({
        postId: mongoose.Types.ObjectId(opposingPostId),
        description: description || ''
      });
      opposingPost.opposedByPosts.push({
        postId: mongoose.Types.ObjectId(postId),
        description: description || ''
      });

      await Promise.all([post.save(), opposingPost.save()]);

      // Invalidate cache after adding opposition
      clearCache('posts');
    }

    res.json({
      success: true,
      message: 'Opposition relationship added successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to add opposition',
      error: error.message
    });
  }
};

exports.removeOpposition = async (req, res) => {
  try {
    const { postId, opposingPostId } = req.params;

    const [post, opposingPost] = await Promise.all([
      Post.findById(postId),
      Post.findById(opposingPostId)
    ]);

    if (!post || !opposingPost) {
      return res.status(404).json({
        success: false,
        message: 'One or both posts not found'
      });
    }

    // Remove opposition relationship from both posts
    if (post.opposingPosts) {
      post.opposingPosts = post.opposingPosts.filter(
        (op) => op.postId.toString() !== opposingPostId
      );
    }
    if (opposingPost.opposedByPosts) {
      opposingPost.opposedByPosts = opposingPost.opposedByPosts.filter(
        (op) => op.postId.toString() !== postId
      );
    }

    await Promise.all([post.save(), opposingPost.save()]);

    // Invalidate cache after removing opposition
    clearCache('posts');

    res.json({
      success: true,
      message: 'Opposition relationship removed successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to remove opposition',
      error: error.message
    });
  }
};

exports.getPostOppositions = async (req, res) => {
  try {
    const { postId } = req.params;
    const post = await Post.findById(postId)
      .populate({
        path: 'opposingPosts.postId',
        select: 'title imageUrl journalist isDeleted',
        model: 'Post',
        match: { isDeleted: { $ne: true } },
        populate: {
          path: 'journalist',
          select: '_id name avatarUrl username isVerified followers',
          model: 'User'
        }
      })
      .populate({
        path: 'opposedByPosts.postId',
        select: 'title imageUrl journalist isDeleted',
        model: 'Post',
        match: { isDeleted: { $ne: true } },
        populate: {
          path: 'journalist',
          select: '_id name avatarUrl username isVerified followers',
          model: 'User'
        }
      });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Transform populated data to match client expectations
    const formattedOpposingPosts = (post.opposingPosts || [])
      .filter((op) => op.postId != null) // Filter out deleted posts
      .map((op) => ({
        postId: op.postId._id.toString(),
        title: op.postId.title,
        imageUrl: op.postId.imageUrl || '',
        description: op.description || '',
        journalist: op.postId.journalist
          ? {
            id: op.postId.journalist._id,
            name: op.postId.journalist.name,
            username: op.postId.journalist.username,
            avatarUrl: buildMediaUrl(req, op.postId.journalist.avatarUrl),
            isVerified: op.postId.journalist.isVerified
          }
          : null
      }));

    const formattedOpposedByPosts = (post.opposedByPosts || [])
      .filter((op) => op.postId != null) // Filter out deleted posts
      .map((op) => ({
        postId: op.postId._id.toString(),
        title: op.postId.title,
        imageUrl: op.postId.imageUrl || '',
        description: op.description || '',
        journalist: op.postId.journalist
          ? {
            id: op.postId.journalist._id,
            name: op.postId.journalist.name,
            username: op.postId.journalist.username,
            avatarUrl: buildMediaUrl(req, op.postId.journalist.avatarUrl),
            isVerified: op.postId.journalist.isVerified
          }
          : null
      }));

    res.json({
      success: true,
      data: {
        opposingPosts: formattedOpposingPosts,
        opposedByPosts: formattedOpposedByPosts
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to fetch oppositions',
      error: error.message
    });
  }
};

exports.getPostInteractions = async (req, res) => {
  try {
    const { id, type } = req.params;
    const post = await Post.findById(id)
      .where({ isDeleted: { $ne: true } })
      .populate('userInteractions.votes', 'name avatarUrl')
      .populate('userInteractions.bookmarks', 'name avatarUrl')
      .populate('userInteractions.comments', 'name avatarUrl');

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    let users = [];
    if (post.userInteractions && post.userInteractions[type]) {
      users = post.userInteractions[type];
    }

    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to fetch interactions',
      error: error.message
    });
  }
};

exports.getInteractionUsers = async (req, res) => {
  try {
    const { id } = req.params;
    // Get type from params first, then query
    const type = req.params.type || req.query.type;

    if (!type) {
      return res.status(400).json({
        success: false,
        message: 'Interaction type is required'
      });
    }

    // Map 'votes' to 'likes' for compatibility
    const mappedType = type === 'votes' ? 'likes' : type;

    const post = await Post.findById(id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Get all user IDs from the interaction
    const userIds =
      post.interactions[mappedType]?.users.map((u) => u.user) || [];

    // Query User collection (includes both regular users and journalists)
    const users = await User.find({ _id: { $in: userIds } }).select(
      'name avatarUrl username isVerified role organization'
    );

    // Format the results
    const allUsers = users.map((user) => ({
      _id: user._id,
      name: user.name,
      avatarUrl: buildMediaUrl(req, user.avatarUrl),
      username: user.username,
      isJournalist: user.role === 'journalist',
      isVerified: user.isVerified || false,
      organization: user.organization || ''
    }));

    // Sort journalists first, then regular users
    const sortedUsers = allUsers.sort((a, b) => {
      // Journalists first
      if (a.isJournalist && !b.isJournalist) return -1;
      if (!a.isJournalist && b.isJournalist) return 1;
      // Maintain original order for same type
      const indexA = userIds.findIndex(
        (id) => id.toString() === a._id.toString()
      );
      const indexB = userIds.findIndex(
        (id) => id.toString() === b._id.toString()
      );
      return indexA - indexB;
    });

    res.json({
      success: true,
      data: sortedUsers
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to get interaction users',
      error: error.message
    });
  }
};

exports.voteOnOpposition = async (req, res) => {
  try {
    const { postId } = req.params;
    const { winnerId, reason } = req.body;

    if (!winnerId) {
      return res.status(400).json({
        success: false,
        message: 'Winner ID is required'
      });
    }

    // Get the post and check if it has oppositions
    const post = await Post.findById(postId)
      .where({ isDeleted: { $ne: true } })
      .populate({
        path: 'opposingPosts.postId',
        match: { isDeleted: { $ne: true } }
      })
      .populate({
        path: 'opposedByPosts.postId',
        match: { isDeleted: { $ne: true } }
      });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Verify winnerId is either this post or one of its oppositions
    const allOppositions = [
      ...post.opposingPosts
        .filter((op) => op.postId)
        .map((op) => op.postId._id.toString()),
      ...post.opposedByPosts
        .filter((op) => op.postId)
        .map((op) => op.postId._id.toString()),
      postId
    ];

    if (!allOppositions.includes(winnerId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid winner ID'
      });
    }

    // Store vote (for now, we'll use the user model to track votes)
    // In a real implementation, you might want a separate OppositionVote collection
    const user = req.user;
    if (!user.oppositionVotes) {
      user.oppositionVotes = new Map();
    }

    user.oppositionVotes.set(postId, {
      winnerId,
      reason,
      votedAt: new Date()
    });

    await user.save();

    // Invalidate cache after voting on opposition
    clearCache('posts');

    // Calculate vote statistics (simplified version)
    // In production, you'd want to aggregate votes from all users
    const votes = {
      [postId]: 0,
      ...Object.fromEntries(allOppositions.map((id) => [id, 0]))
    };

    // This is a simplified response - in production you'd aggregate real votes
    votes[winnerId] = 1;
    const totalVotes = Object.values(votes).reduce(
      (sum, count) => sum + count,
      0
    );

    const percentage = {};
    Object.keys(votes).forEach((id) => {
      percentage[id] =
        totalVotes > 0 ? Math.round((votes[id] / totalVotes) * 100) : 0;
    });

    res.json({
      success: true,
      data: {
        votes,
        percentage,
        totalVotes
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to vote on opposition',
      error: error.message
    });
  }
};

exports.getPoliticalVoters = async (req, res) => {
  try {
    const { id } = req.params;
    const orientation = req.query.orientation;

    // Find the post first
    const post = await Post.findById(id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Filter voters by orientation if specified
    let voters = post.politicalOrientation.voters || [];
    if (orientation) {
      voters = voters.filter((voter) => voter.view === orientation);
    }

    // Get current user for follow status
    const currentUserId = req.user?._id;
    const currentUser = currentUserId ? await User.findById(currentUserId).select('followedJournalists following') : null;

    // Manually populate the voters
    const populatedVoters = await Promise.all(
      voters.map(async (voter) => {
        try {
          const populatedUser = await User.findById(voter.userId).select(
            'name username avatarUrl isVerified role'
          );

          if (!populatedUser) {
            return null; // Skip if user not found
          }

          // Check if current user is following this voter
          let isFollowing = false;
          if (currentUser && populatedUser.role === 'journalist') {
            isFollowing = currentUser.followedJournalists?.some(id => id.toString() === populatedUser._id.toString()) || false;
          } else if (currentUser) {
            isFollowing = currentUser.following?.some(id => id.toString() === populatedUser._id.toString()) || false;
          }

          return {
            ...populatedUser.toObject(),
            isJournalist: populatedUser.role === 'journalist',
            view: voter.view,
            votedAt: voter.votedAt,
            isFollowing
          };
        } catch (err) {
          console.error('Error populating voter:', err);
          return null;
        }
      })
    );

    // Filter out null values and sort
    const formattedVoters = populatedVoters
      .filter((voter) => voter !== null)
      .sort((a, b) => {
        // Journalists first
        if (a.isJournalist && !b.isJournalist) return -1;
        if (!a.isJournalist && b.isJournalist) return 1;
        // Then by date (most recent first)
        return new Date(b.votedAt) - new Date(a.votedAt);
      });

    res.json({
      success: true,
      data: {
        voters: formattedVoters,
        total: formattedVoters.length
      }
    });
  } catch (error) {
    console.error('[POST] Error getting political voters:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to get political voters',
      error: error.message
    });
  }
};

exports.voteOnQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const { optionId, optionIds, optionIndex } = req.body;
    const userId = req.user._id;

    // Find the post and verify it's a question
    const post = await Post.findById(id).where({ isDeleted: { $ne: true } });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    if (post.type !== 'question') {
      return res.status(400).json({
        success: false,
        message: 'This post is not a question'
      });
    }

    // Initialize metadata.question if needed
    if (!post.metadata) {
      post.metadata = {};
    }
    if (!post.metadata.question) {
      post.metadata.question = {
        options: [],
        totalVotes: 0,
        isMultipleChoice: false,
        voters: []
      };
    }

    // Check if question is still active
    if (
      post.metadata.question.endDate &&
      new Date(post.metadata.question.endDate) < new Date()
    ) {
      return res.status(400).json({
        success: false,
        message: 'This question has expired'
      });
    }

    // Initialize voters array if needed
    if (!post.metadata.question.voters) {
      post.metadata.question.voters = [];
    }

    // Check if user already voted
    const existingVoteIndex = post.metadata.question.voters.findIndex(
      (voter) => voter.userId?.toString() === userId.toString()
    );

    if (existingVoteIndex !== -1) {
      // Remove previous votes
      const previousVotes =
        post.metadata.question.voters[existingVoteIndex].optionIds || [];
      previousVotes.forEach((prevOptionId) => {
        const option = post.metadata.question.options.find(
          (opt) => opt._id?.toString() === prevOptionId.toString()
        );
        if (option && option.votes > 0) {
          option.votes--;
        }
      });
      // Remove the voter entry
      post.metadata.question.voters.splice(existingVoteIndex, 1);
    }

    // Handle voting based on multiple choice setting or optionIndex (for backward compatibility)
    let votedOptionIds = [];

    // Support for optionIndex (backward compatibility)
    if (optionIndex !== undefined && optionIndex !== null) {
      if (
        optionIndex < 0 ||
        optionIndex >= post.metadata.question.options.length
      ) {
        return res.status(400).json({
          success: false,
          message: 'Invalid option index'
        });
      }
      const option = post.metadata.question.options[optionIndex];
      votedOptionIds = [option._id];
    } else if (post.metadata.question.isMultipleChoice && optionIds) {
      // Multiple choice voting
      votedOptionIds = optionIds;
    } else if (optionId) {
      // Single choice voting
      votedOptionIds = [optionId];
    } else {
      return res.status(400).json({
        success: false,
        message: 'No option selected'
      });
    }

    // Validate option IDs and update votes
    let validVotes = 0;
    votedOptionIds.forEach((voteOptionId) => {
      const option = post.metadata.question.options.find(
        (opt) => opt._id?.toString() === voteOptionId.toString()
      );
      if (option) {
        option.votes = (option.votes || 0) + 1;
        validVotes++;
      }
    });

    if (validVotes === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid option ID(s)'
      });
    }

    // Add voter record
    post.metadata.question.voters.push({
      userId: userId,
      optionIds: votedOptionIds,
      votedAt: new Date()
    });

    // Update total votes
    post.metadata.question.totalVotes = post.metadata.question.options.reduce(
      (total, option) => total + (option.votes || 0),
      0
    );

    // Calculate percentages
    const updatedOptions = post.metadata.question.options.map((option) => ({
      _id: option._id,
      text: option.text,
      votes: option.votes || 0,
      percentage:
        post.metadata.question.totalVotes > 0
          ? Math.round(
            ((option.votes || 0) / post.metadata.question.totalVotes) * 100
          )
          : 0
    }));

    // Mark the post as changed to ensure subdocument updates are saved
    post.markModified('metadata.question');

    // Save the post
    await post.save();

    // Invalidate cache after voting on question
    clearCache('posts');

    console.log('[POST] Question vote saved to DB:', {
      postId: post._id,
      userId,
      votedOptionIds,
      totalVotes: post.metadata.question.totalVotes,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Vote registered successfully',
      data: {
        updatedOptions,
        totalVotes: post.metadata.question.totalVotes,
        userVote: post.metadata.question.isMultipleChoice
          ? votedOptionIds
          : votedOptionIds[0]
      }
    });
  } catch (error) {
    console.error('Vote on question error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to register vote',
      error: error.message
    });
  }
};

exports.removeVoteOnQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    // Find the post and verify it's a question
    const post = await Post.findById(id).where({ isDeleted: { $ne: true } });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    if (post.type !== 'question') {
      return res.status(400).json({
        success: false,
        message: 'This post is not a question'
      });
    }

    // Check if question has metadata
    if (!post.metadata?.question) {
      return res.status(400).json({
        success: false,
        message: 'No voting data found'
      });
    }

    // Check if question is still active
    if (
      post.metadata.question.endDate &&
      new Date(post.metadata.question.endDate) < new Date()
    ) {
      return res.status(400).json({
        success: false,
        message: 'This question has expired'
      });
    }

    // Find user's vote
    const voterIndex = post.metadata.question.voters?.findIndex(
      (voter) => voter.userId?.toString() === userId.toString()
    );

    if (voterIndex === -1) {
      return res.status(400).json({
        success: false,
        message: 'You haven\'t voted on this question'
      });
    }

    // Remove votes from options
    const voter = post.metadata.question.voters[voterIndex];
    const removedOptionIds = voter.optionIds || [];
    
    removedOptionIds.forEach((optionId) => {
      const option = post.metadata.question.options.find(
        (opt) => opt._id?.toString() === optionId.toString()
      );
      if (option && option.votes > 0) {
        option.votes--;
      }
    });

    // Remove the voter entry
    post.metadata.question.voters.splice(voterIndex, 1);

    // Update total votes
    post.metadata.question.totalVotes = post.metadata.question.options.reduce(
      (total, option) => total + (option.votes || 0),
      0
    );

    // Calculate percentages
    const updatedOptions = post.metadata.question.options.map((option) => ({
      _id: option._id,
      text: option.text,
      votes: option.votes || 0,
      percentage:
        post.metadata.question.totalVotes > 0
          ? Math.round(
            ((option.votes || 0) / post.metadata.question.totalVotes) * 100
          )
          : 0
    }));

    // Mark the post as changed to ensure subdocument updates are saved
    post.markModified('metadata.question');

    // Save the post
    await post.save();

    // Invalidate cache after removing vote
    clearCache('posts');

    console.log('[POST] Question vote removed from DB:', {
      postId: post._id,
      userId,
      removedOptionIds,
      totalVotes: post.metadata.question.totalVotes,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Vote removed successfully',
      data: {
        updatedOptions,
        totalVotes: post.metadata.question.totalVotes
      }
    });
  } catch (error) {
    console.error('Remove vote on question error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to remove vote',
      error: error.message
    });
  }
};

// Save or unsave a post
exports.savePost = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const post = await Post.findById(id).where({ isDeleted: { $ne: true } });
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Initialize bookmarks if needed
    if (!post.interactions) {
      post.interactions = {};
    }
    if (!post.interactions.bookmarks) {
      post.interactions.bookmarks = { users: [], count: 0 };
    }
    if (!Array.isArray(post.interactions.bookmarks.users)) {
      post.interactions.bookmarks.users = [];
    }

    // Check if user has already saved this post
    const isSaved = post.interactions.bookmarks.users.some(
      b => b.user && b.user.toString() === userId.toString()
    );

    if (isSaved) {
      // Unsave the post
      post.interactions.bookmarks.users = post.interactions.bookmarks.users.filter(
        b => b.user && b.user.toString() !== userId.toString()
      );
      post.interactions.bookmarks.count = Math.max(0, post.interactions.bookmarks.users.length);
    } else {
      // Save the post
      post.interactions.bookmarks.users.push({
        user: userId,
        createdAt: new Date()
      });
      post.interactions.bookmarks.count = post.interactions.bookmarks.users.length;
    }

    await post.save();

    res.json({
      success: true,
      data: {
        saved: !isSaved,
        savedCount: post.interactions.bookmarks.count
      }
    });
  } catch (error) {
    console.error('Save post error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to save post',
      error: error.message
    });
  }
};
