/* eslint-disable */
const User = require('../models/user.model');
const Post = require('../models/post.model');
const Comment = require('../models/comment.model');
const Report = require('../models/report.model');
const Short = require('../models/short.model');
// Removed buildMediaUrl - returning relative URLs

// Get all journalists with press card verification info
exports.getJournalistsWithPressCards = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, verified, hasPressCard } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build query for journalists
    const query = { role: 'journalist' };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { organization: { $regex: search, $options: 'i' } },
        { pressCard: { $regex: search, $options: 'i' } }
      ];
    }
    if (verified !== undefined) {
      query.isVerified = verified === 'true';
    }
    if (hasPressCard === 'true') {
      query.pressCard = { $exists: true, $ne: null };
    } else if (hasPressCard === 'false') {
      query.$or = [
        { pressCard: { $exists: false } },
        { pressCard: null },
        { pressCard: '' }
      ];
    }

    const [journalists, total] = await Promise.all([
      User.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(skip)
        .select('-password'),
      User.countDocuments(query)
    ]);

    // Convert URLs for all journalists
    const journalistsWithUrls = journalists.map(journalist => {
      const journalistObj = journalist.toObject();
      // Keep URLs as relative paths
      // Ensure we have the ID field
      journalistObj.id = journalistObj._id;
      // Calculate stats
      journalistObj.postsCount = journalistObj.stats?.postes || 0;
      journalistObj.followersCount = journalistObj.followers?.length || 0;
      journalistObj.followingCount = journalistObj.following?.length || 0;
      journalistObj.isVerified = journalistObj.isVerified || false;
      return journalistObj;
    });

    res.json({
      success: true,
      journalists: journalistsWithUrls,
      total: total,
      verified: journalistsWithUrls.filter(j => j.isVerified).length,
      pending: journalistsWithUrls.filter(j => !j.isVerified).length,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get journalists with press cards error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des journalistes'
    });
  }
};

// Toggle journalist verification based on press card
exports.toggleJournalistVerification = async (req, res) => {
  try {
    const { id } = req.params;
    const { verify } = req.body;

    const journalist = await User.findOne({ _id: id, role: 'journalist' });
    if (!journalist) {
      return res.status(404).json({
        success: false,
        message: 'Journaliste non trouvé'
      });
    }

    journalist.isVerified = verify;
    if (verify) {
      journalist.verificationDate = new Date();
      journalist.verifiedBy = req.userId;
    } else {
      journalist.unverificationDate = new Date();
      journalist.unverifiedBy = req.userId;
      journalist.unverificationReason = 'Manual unverification by admin';
    }

    await journalist.save();

    // Return formatted journalist data
    const journalistObj = journalist.toObject();
    // Keep URLs as relative paths
    journalistObj.id = journalistObj._id;
    journalistObj.postsCount = journalistObj.stats?.postes || 0;
    journalistObj.followersCount = journalistObj.followers?.length || 0;
    journalistObj.followingCount = journalistObj.following?.length || 0;
    journalistObj.isVerified = journalistObj.isVerified || false;

    res.json({
      success: true,
      message: verify ? 'Journaliste vérifié avec succès' : 'Vérification retirée',
      journalist: journalistObj
    });
  } catch (error) {
    console.error('Toggle journalist verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour de la vérification'
    });
  }
};


// Review report and take action
exports.reviewReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, actionTaken, resolution } = req.body;

    const report = await Report.findById(id);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Signalement non trouvé'
      });
    }

    report.status = status;
    report.reviewedBy = req.userId;
    report.reviewedAt = new Date();
    if (actionTaken) report.actionTaken = actionTaken;
    if (resolution) report.resolution = resolution;

    await report.save();

    // Take action based on actionTaken
    if (actionTaken === 'content_removed') {
      switch (report.targetType) {
      case 'post':
        await Post.findByIdAndDelete(report.targetId);
        break;
      case 'comment':
        await Comment.findByIdAndDelete(report.targetId);
        break;
      case 'short':
        await Short.findByIdAndDelete(report.targetId);
        break;
      }
    } else if (actionTaken === 'user_suspended' || actionTaken === 'user_banned') {
      const user = await User.findById(report.targetId);
      if (user) {
        user.status = actionTaken === 'user_suspended' ? 'suspended' : 'inactive';
        user.suspensionReason = resolution;
        user.suspendedAt = new Date();
        user.suspendedBy = req.userId;
        await user.save();
      }
    }

    res.json({
      success: true,
      message: 'Signalement traité avec succès',
      report
    });
  } catch (error) {
    console.error('Review report error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du traitement du signalement'
    });
  }
};

// Delete content (posts, comments, shorts)
exports.deleteContent = async (req, res) => {
  try {
    const { type, id } = req.params;

    let Model;
    switch (type) {
    case 'post':
      Model = Post;
      break;
    case 'comment':
      Model = Comment;
      break;
    case 'short':
      Model = Short;
      break;
    default:
      return res.status(400).json({
        success: false,
        message: 'Type de contenu invalide'
      });
    }

    const content = await Model.findById(id);
    if (!content) {
      return res.status(404).json({
        success: false,
        message: 'Contenu non trouvé'
      });
    }

    await content.deleteOne();

    res.json({
      success: true,
      message: 'Contenu supprimé avec succès'
    });
  } catch (error) {
    console.error('Delete content error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression du contenu'
    });
  }
};

// Delete specific post
exports.deletePost = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const post = await Post.findById(id).populate('journalist', 'username name');
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Log deletion for audit trail
    console.log(`Admin ${req.userId} deleted post ${id} by ${post.journalist?.username || post.journalist?.name} - Reason: ${reason}`);

    await Post.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Post deleted successfully'
    });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete post'
    });
  }
};

// Delete specific comment
exports.deleteComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const comment = await Comment.findById(id).populate('author', 'username');
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }

    // Log deletion for audit trail
    console.log(`Admin ${req.userId} deleted comment ${id} by ${comment.author?.username} - Reason: ${reason}`);

    await Comment.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Comment deleted successfully'
    });
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete comment'
    });
  }
};

// Delete specific short
exports.deleteShort = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const short = await Short.findById(id).populate('author', 'username');
    if (!short) {
      return res.status(404).json({
        success: false,
        message: 'Short not found'
      });
    }

    // Log deletion for audit trail
    console.log(`Admin ${req.userId} deleted short ${id} by ${short.author?.username} - Reason: ${reason}`);

    await Short.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Short deleted successfully'
    });
  } catch (error) {
    console.error('Delete short error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete short'
    });
  }
};

// Statistiques complètes du dashboard admin
exports.getStats = async (req, res) => {
  try {
    // Dates pour les calculs de croissance
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Statistiques globales
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ lastActive: { $gte: weekAgo } });
    const bannedUsers = await User.countDocuments({ status: 'banned' });
    const suspendedUsers = await User.countDocuments({ status: 'suspended' });
    const totalJournalists = await User.countDocuments({ role: 'journalist' });
    const verifiedJournalists = await User.countDocuments({ role: 'journalist', isVerified: true });
    const pendingJournalists = await User.countDocuments({ role: 'journalist', isVerified: false });
    const totalPosts = await Post.countDocuments();
    const totalComments = await Comment.countDocuments();
    
    // Calcul des likes totaux avec gestion des posts sans likes
    const likesAggregation = await Post.aggregate([
      { 
        $group: { 
          _id: null, 
          totalLikes: { 
            $sum: { 
              $cond: [
                { $isArray: '$likes' },
                { $size: '$likes' },
                { $ifNull: ['$interactions.likes', 0] }
              ]
            }
          }
        }
      }
    ]);
    const totalLikes = likesAggregation[0]?.totalLikes || 0;

    // Statistiques de croissance
    const newUsersToday = await User.countDocuments({ createdAt: { $gte: today } });
    const newUsersThisWeek = await User.countDocuments({ createdAt: { $gte: weekAgo } });
    const newUsersThisMonth = await User.countDocuments({ createdAt: { $gte: monthAgo } });
    const usersLastMonth = await User.countDocuments({ createdAt: { $lt: monthAgo } });
    const growthRate = usersLastMonth > 0 ? ((newUsersThisMonth / usersLastMonth) * 100).toFixed(2) : 0;

    // Statistiques de contenu
    const postsToday = await Post.countDocuments({ createdAt: { $gte: today } });
    const postsThisWeek = await Post.countDocuments({ createdAt: { $gte: weekAgo } });
    const avgPostsPerDay = (postsThisWeek / 7).toFixed(2);

    // Top catégories (basé sur le type de post)
    const topCategories = await Post.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    // Statistiques d'engagement
    const avgLikesPerPost = totalPosts > 0 ? (totalLikes / totalPosts).toFixed(2) : 0;
    const avgCommentsPerPost = totalPosts > 0 ? (totalComments / totalPosts).toFixed(2) : 0;
    const engagementRate = totalPosts > 0 ? (((totalLikes + totalComments) / (totalPosts * totalUsers)) * 100).toFixed(2) : 0;

    // Statistiques des signalements
    const pendingReports = await Report.countDocuments({ status: 'pending' });
    const todayReports = await Report.countDocuments({ createdAt: { $gte: today } });

    const stats = {
      overview: {
        totalUsers,
        activeUsers,
        bannedUsers,
        suspendedUsers,
        totalJournalists,
        verifiedJournalists,
        totalPosts,
        totalComments,
        totalLikes
      },
      growth: {
        newUsersToday,
        newUsersThisWeek,
        newUsersThisMonth,
        growthRate: parseFloat(growthRate)
      },
      content: {
        postsToday,
        postsThisWeek,
        avgPostsPerDay: parseFloat(avgPostsPerDay),
        topCategories: topCategories.map(cat => ({ type: cat._id, count: cat.count }))
      },
      engagement: {
        avgLikesPerPost: parseFloat(avgLikesPerPost),
        avgCommentsPerPost: parseFloat(avgCommentsPerPost),
        engagementRate: parseFloat(engagementRate)
      },
      // Données supplémentaires pour le dashboard
      pendingJournalists,
      reports: {
        pending: pendingReports,
        today: todayReports
      }
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get statistics',
      error: error.message
    });
  }
};

exports.getJournalists = async (req, res) => {
  try {
    const {
      search,
      sortBy = 'createdAt',
      order = 'desc',
      status,
      page = 1,
      limit = 20
    } = req.query;

    // Build query - always filter for journalist role
    let query = { role: 'journalist' };

    // Add status filter if provided
    if (status === 'verified') {
      query.isVerified = true;
      query.status = 'active';
    } else if (status === 'suspended') {
      query.status = 'suspended';
    } else if (status) {
      query.status = status;
    }

    // Add name search if provided
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    let sort = {};
    switch (sortBy) {
    case 'name':
      sort.name = order === 'desc' ? -1 : 1;
      break;
    case 'createdAt':
      sort.createdAt = order === 'desc' ? -1 : 1;
      break;
    case 'lastActive':
      sort.lastActive = order === 'desc' ? -1 : 1;
      break;
    case 'followers':
      sort.followers = order === 'desc' ? -1 : 1;
      break;
    default:
      sort.createdAt = -1;
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await User.countDocuments(query);

    // Get journalists with full details
    const journalists = await User.find(query)
      .select('-password')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Get post count for each journalist
    const journalistIds = journalists.map(j => j._id);
    const postCounts = await Post.aggregate([
      { $match: { journalist: { $in: journalistIds } } },
      { $group: { _id: '$journalist', count: { $sum: 1 } } }
    ]);

    const postCountMap = postCounts.reduce((acc, curr) => {
      acc[curr._id.toString()] = curr.count;
      return acc;
    }, {});

    // Format response with all details - keeping all original fields
    const formattedJournalists = journalists.map(journalist => {
      const journalistObj = journalist.toObject();
      
      // Add computed fields
      journalistObj.id = journalistObj._id;
      journalistObj.postsCount = postCountMap[journalist._id.toString()] || 0;
      journalistObj.followersCount = journalistObj.followers?.length || 0;
      journalistObj.followingCount = journalistObj.following?.length || 0;
      journalistObj.isVerified = journalistObj.isVerified || false;
      
      // Convert URLs
      // Keep URLs as relative paths
      
      return journalistObj;
    });

    res.json({
      success: true,
      data: {
        journalists: formattedJournalists,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get journalists',
      error: error.message
    });
  }
};

exports.getVerifiedJournalists = async (req, res) => {
  try {
    const journalists = await User.find({
      role: 'journalist',
      isVerified: true,
      status: 'active' // Only include active journalists
    })
      .select('name username email specialties createdAt status isVerified lastActive avatarUrl')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: journalists
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get verified journalists',
      error: error.message
    });
  }
};

exports.getPendingJournalists = async (req, res) => {
  try {
    const journalists = await User.find({
      role: 'journalist',
      isVerified: false,
      status: 'active'
    })
      .select('name username email specialties createdAt status isVerified lastActive avatarUrl')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: journalists
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get unverified journalists',
      error: error.message
    });
  }
};

exports.getRejectedJournalists = async (req, res) => {
  try {
    const journalists = await User.find({
      role: 'journalist',
      status: 'rejected'
    })
      .select('name username email specialties createdAt status isVerified lastActive avatarUrl')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: journalists
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get rejected journalists',
      error: error.message
    });
  }
};

exports.approveJournalist = async (req, res) => {
  try {
    const { notes } = req.body;
    const journalist = await User.findOne({ _id: req.params.id, role: 'journalist' });
    
    if (!journalist) {
      return res.status(404).json({
        success: false,
        message: 'Journalist not found'
      });
    }

    journalist.status = 'active';
    journalist.isVerified = true;
    journalist.verificationDate = new Date();
    journalist.verifiedBy = req.userId;
    if (notes) {
      journalist.verificationNotes = notes;
    }
    
    await journalist.save();

    // TODO: Send notification email to journalist

    res.json({
      success: true,
      message: 'Journaliste approuvé',
      data: {
        verificationStatus: 'verified',
        verificationDate: journalist.verificationDate,
        verifiedBy: req.userId
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to approve journalist',
      error: error.message
    });
  }
};

exports.rejectJournalist = async (req, res) => {
  try {
    const { reason, notes } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const journalist = await User.findOne({ _id: req.params.id, role: 'journalist' });
    if (!journalist) {
      return res.status(404).json({
        success: false,
        message: 'Journalist not found'
      });
    }

    journalist.status = 'rejected';
    journalist.isVerified = false;
    journalist.rejectionDate = new Date();
    journalist.rejectedBy = req.userId;
    journalist.rejectionReason = reason;
    if (notes) {
      journalist.rejectionNotes = notes;
    }

    await journalist.save();

    // TODO: Send notification email to journalist with reason

    res.json({
      success: true,
      message: 'Journalist rejected successfully',
      data: {
        verificationStatus: 'rejected',
        rejectionDate: journalist.rejectionDate,
        rejectedBy: req.userId,
        reason: reason
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to reject journalist',
      error: error.message
    });
  }
};

exports.unverifyJournalist = async (req, res) => {
  try {
    const { reason, suspensionDuration } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Reason for unverification is required'
      });
    }

    const journalist = await User.findOne({ _id: req.params.id, role: 'journalist' });
    if (!journalist) {
      return res.status(404).json({
        success: false,
        message: 'Journalist not found'
      });
    }

    journalist.isVerified = false;
    journalist.unverificationDate = new Date();
    journalist.unverifiedBy = req.userId;
    journalist.unverificationReason = reason;

    if (suspensionDuration) {
      journalist.suspendedUntil = new Date(Date.now() + suspensionDuration * 24 * 60 * 60 * 1000);
    }

    await journalist.save();

    // TODO: Send notification email to journalist

    res.json({
      success: true,
      message: 'Journalist unverified successfully',
      data: {
        isVerified: false,
        unverificationDate: journalist.unverificationDate,
        unverifiedBy: req.userId,
        reason: reason,
        suspendedUntil: journalist.suspendedUntil
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to unverify journalist',
      error: error.message
    });
  }
};


exports.getJournalistStats = async (req, res) => {
  try {
    const stats = {
      total: await User.countDocuments({ role: 'journalist', status: 'active' }),
      active: await User.countDocuments({ role: 'journalist', status: 'active', isVerified: true }),
      unverified: await User.countDocuments({
        role: 'journalist',
        isVerified: false,
        status: 'active'
      }),
      suspended: await User.countDocuments({ role: 'journalist', status: 'suspended' })
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get journalist statistics',
      error: error.message
    });
  }
};

// Gestion des utilisateurs
exports.getUsers = async (req, res) => {
  try {
    const {
      search,
      role,
      status,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      order = 'desc'
    } = req.query;

    // Build query
    let query = {};
    
    if (role) {
      query.role = role;
    } else {
      // Par défaut, exclure les journalistes sauf si explicitement demandé
      query.role = { $ne: 'journalist' };
    }
    
    if (status) {
      query.status = status;
    }
    
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort
    const sort = {};
    sort[sortBy] = order === 'desc' ? -1 : 1;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await User.countDocuments(query);

    const users = await User.find(query)
      .select('-password')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Format users with proper URLs
    const usersWithUrls = users.map(user => {
      const userObj = user.toObject();
      // Keep URLs as relative paths
      // Ensure consistent data structure
      userObj.id = userObj._id;
      userObj.postsCount = userObj.stats?.postes || 0;
      userObj.followersCount = userObj.followers?.length || 0;
      userObj.followingCount = userObj.following?.length || 0;
      userObj.isVerified = userObj.isVerified || false;
      return userObj;
    });

    res.json({
      success: true,
      users: usersWithUrls,
      totalPages: Math.ceil(total / parseInt(limit)),
      data: {
        users: usersWithUrls,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get users',
      error: error.message
    });
  }
};

// Suspendre un utilisateur
exports.suspendUser = async (req, res) => {
  try {
    const { reason, duration } = req.body;
    const userId = req.params.id;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Suspension reason is required'
      });
    }

    // Prevent admin from suspending themselves
    if (userId === req.userId) {
      return res.status(403).json({
        success: false,
        message: 'You cannot suspend your own account'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent suspending other admins
    if (user.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Cannot suspend another admin'
      });
    }

    // Use updateOne to avoid validation issues with missing username
    const updateData = {
      status: 'suspended',
      suspensionReason: reason,
      suspendedAt: new Date(),
      suspendedBy: req.userId
    };
    
    if (duration) {
      updateData.suspendedUntil = new Date(Date.now() + duration * 24 * 60 * 60 * 1000);
    }

    await User.updateOne(
      { _id: userId },
      { $set: updateData }
    );

    res.json({
      success: true,
      message: 'User suspended successfully',
      data: {
        status: 'suspended',
        suspendedAt: updateData.suspendedAt,
        suspendedUntil: updateData.suspendedUntil
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to suspend user',
      error: error.message
    });
  }
};

// Bannir un utilisateur (permanent)
exports.banUser = async (req, res) => {
  try {
    const { reason } = req.body;
    const userId = req.params.id;

    console.log(`Ban request for user ${userId} with reason: ${reason}`);

    if (!reason) {
      console.log('Ban attempt blocked: No reason provided');
      return res.status(400).json({
        success: false,
        message: 'Ban reason is required'
      });
    }

    // Prevent admin from banning themselves
    if (userId === req.userId) {
      return res.status(403).json({
        success: false,
        message: 'You cannot ban your own account'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      console.log(`Ban attempt: User ${userId} not found`);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log(`Ban attempt: User ${userId} found with role: ${user.role}`);

    // Prevent banning other admins
    if (user.role === 'admin') {
      console.log(`Ban attempt blocked: User ${userId} is an admin`);
      return res.status(403).json({
        success: false,
        message: 'Cannot ban another admin'
      });
    }

    // Use updateOne to avoid validation issues with missing username
    const updateData = {
      status: 'banned',
      banReason: reason,
      bannedAt: new Date(),
      bannedBy: req.userId
    };

    await User.updateOne(
      { _id: userId },
      { $set: updateData }
    );

    res.json({
      success: true,
      message: 'User banned successfully',
      data: {
        status: 'banned',
        bannedAt: updateData.bannedAt,
        banReason: reason
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to ban user',
      error: error.message
    });
  }
};

// Débannir un utilisateur
exports.unbanUser = async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.status !== 'banned' && user.status !== 'suspended') {
      return res.status(400).json({
        success: false,
        message: 'User is not banned or suspended'
      });
    }

    // Use updateOne to avoid validation issues with missing username
    const updateData = {
      status: 'active',
      unbannedAt: new Date(),
      unbannedBy: req.userId
    };

    // If user has status-related fields, clear them
    if (user.suspensionReason) {
      updateData.suspensionReason = null;
    }
    if (user.suspendedAt) {
      updateData.suspendedAt = null;
    }
    if (user.suspendedBy) {
      updateData.suspendedBy = null;
    }
    if (user.suspendedUntil) {
      updateData.suspendedUntil = null;
    }
    if (user.banReason) {
      updateData.banReason = null;
    }
    if (user.bannedAt) {
      updateData.bannedAt = null;
    }
    if (user.bannedBy) {
      updateData.bannedBy = null;
    }

    await User.updateOne(
      { _id: userId },
      { $set: updateData }
    );

    res.json({
      success: true,
      message: 'User unbanned successfully',
      data: {
        status: 'active',
        unbannedAt: updateData.unbannedAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to unban user',
      error: error.message
    });
  }
};

// Modifier le rôle d'un utilisateur
exports.updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    const userId = req.params.id;

    if (!['user', 'admin', 'journalist'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role'
      });
    }

    // Prevent admin from changing their own role
    if (userId === req.userId) {
      return res.status(403).json({
        success: false,
        message: 'You cannot change your own role'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const oldRole = user.role;
    
    // Use updateOne to avoid validation issues with required fields
    await User.updateOne(
      { _id: userId },
      { $set: { role: role } }
    );

    // Note: When changing a user to journalist role, they need to go through
    // the proper journalist registration process. This just changes their role.

    res.json({
      success: true,
      message: 'User role updated successfully',
      data: {
        userId: user._id,
        oldRole,
        newRole: role
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update user role',
      error: error.message
    });
  }
};

// Obtenir les logs d'audit (simplifiés pour l'instant)
exports.getAuditLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50
    } = req.query;

    // TODO: Implémenter un système de logs complet
    // Pour l'instant, retourner une structure vide
    
    res.json({
      success: true,
      data: {
        logs: [],
        pagination: {
          currentPage: parseInt(page),
          totalPages: 0,
          totalItems: 0,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get audit logs',
      error: error.message
    });
  }
};

// Statistiques détaillées des journalistes avec période
exports.getDetailedJournalistStats = async (req, res) => {
  try {
    const { period = 'month', journalistId } = req.query;

    let dateFilter = {};
    const now = new Date();

    switch (period) {
    case 'day':
      dateFilter = { $gte: new Date(now.setDate(now.getDate() - 1)) };
      break;
    case 'week':
      dateFilter = { $gte: new Date(now.setDate(now.getDate() - 7)) };
      break;
    case 'month':
      dateFilter = { $gte: new Date(now.setMonth(now.getMonth() - 1)) };
      break;
    case 'year':
      dateFilter = { $gte: new Date(now.setFullYear(now.getFullYear() - 1)) };
      break;
    }

    let journalistFilter = {};
    if (journalistId) {
      journalistFilter = { _id: journalistId };
    }

    const journalists = await User.find({ ...journalistFilter, role: 'journalist' })
      .select('name email followers createdAt');

    const statsPromises = journalists.map(async (journalist) => {
      // Posts stats
      const posts = await Post.find({
        journalist: journalist._id,
        createdAt: dateFilter
      });

      const totalViews = posts.reduce((sum, post) => sum + (post.stats?.views || 0), 0);
      const totalLikes = posts.reduce((sum, post) => sum + (post.interactions?.likes?.users?.length || 0), 0);
      const totalComments = await Comment.countDocuments({
        post: { $in: posts.map(p => p._id) }
      });

      // Engagement rate
      const engagementRate = posts.length > 0 
        ? ((totalLikes + totalComments) / (posts.length * journalist.followers.length) * 100).toFixed(2)
        : 0;

      return {
        journalist: {
          _id: journalist._id,
          name: journalist.name,
          email: journalist.email
        },
        stats: {
          posts: posts.length,
          views: totalViews,
          likes: totalLikes,
          comments: totalComments,
          followers: journalist.followers.length,
          engagementRate: parseFloat(engagementRate),
          avgViewsPerPost: posts.length > 0 ? Math.round(totalViews / posts.length) : 0,
          avgLikesPerPost: posts.length > 0 ? Math.round(totalLikes / posts.length) : 0
        }
      };
    });

    const detailedStats = await Promise.all(statsPromises);

    res.json({
      success: true,
      data: {
        period,
        stats: detailedStats
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get detailed journalist statistics',
      error: error.message
    });
  }
};


// Get all posts for admin management
exports.getPosts = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, type, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build query
    const query = {};
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } }
      ];
    }
    if (type) {
      query.type = type;
    }
    if (status) {
      query.status = status;
    }

    // Add filter to exclude posts without journalist field
    query.journalist = { $exists: true, $ne: null };
    
    const [posts, total] = await Promise.all([
      Post.find(query)
        .populate('journalist', 'name username email avatarUrl isVerified')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(skip),
      Post.countDocuments(query)
    ]);

    // Convert URLs and format response
    const postsWithUrls = posts.map(post => {
      try {
        const postObj = post.toObject();
        
        // Handle cover URL
        if (postObj.coverUrl) {
          // Keep URL as relative path
        } else if (postObj.imageUrl) {
          // Fallback to imageUrl if coverUrl is not present
          postObj.coverUrl = postObj.imageUrl; // Use imageUrl as coverUrl
        }
        
        // Ensure journalist exists and has proper structure
        if (postObj.journalist) {
          // Keep URL as relative path
          // Ensure journalist has an ID
          if (!postObj.journalist.id && postObj.journalist._id) {
            postObj.journalist.id = postObj.journalist._id;
          }
        } else {
          // This shouldn't happen with our query filter, but add a fallback
          console.error(`Post ${postObj._id} has no journalist field`);
          postObj.journalist = {
            id: 'unknown',
            name: 'Unknown Journalist',
            username: 'unknown',
            email: 'unknown@example.com',
            avatarUrl: '/assets/images/defaults/default_journalist_avatar.png',
            isVerified: false
          };
        }
        
        // Ensure interactions structure exists
        if (!postObj.interactions) {
          postObj.interactions = {
            likes: { users: [], count: 0 },
            dislikes: { users: [], count: 0 },
            comments: { users: [], count: 0 },
            reports: { users: [], count: 0 },
            bookmarks: { users: [], count: 0 }
          };
        }
        
        return postObj;
      } catch (error) {
        console.error(`Error processing post ${post._id}:`, error);
        // Return a minimal valid post object
        return {
          _id: post._id,
          title: post.title || 'Untitled',
          type: post.type || 'article',
          status: post.status || 'draft',
          createdAt: post.createdAt,
          journalist: {
            id: 'error',
            name: 'Error Loading Journalist',
            username: 'error',
            email: 'error@example.com',
            avatarUrl: '/assets/images/defaults/default_journalist_avatar.png',
            isVerified: false
          },
          interactions: {
            likes: { users: [], count: 0 },
            dislikes: { users: [], count: 0 },
            comments: { users: [], count: 0 },
            reports: { users: [], count: 0 },
            bookmarks: { users: [], count: 0 }
          }
        };
      }
    });

    res.json({
      success: true,
      data: {
        posts: postsWithUrls,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get posts',
      error: error.message
    });
  }
};

// Get all reports for admin management
exports.getReports = async (req, res) => {
  try {
    const { page = 1, limit = 20, status = 'pending', targetType } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build query
    const query = {};
    if (status) {
      query.status = status;
    }
    if (targetType) {
      query.targetType = targetType;
    }

    const [reports, total] = await Promise.all([
      Report.find(query)
        .populate('reportedBy', 'name username email avatarUrl')
        .populate('reviewedBy', 'name username email')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(skip),
      Report.countDocuments(query)
    ]);

    // Populate target details based on targetType
    const reportsWithDetails = await Promise.all(reports.map(async (report) => {
      const reportObj = report.toObject();
      
      try {
        switch (report.targetType) {
        case 'post': {
          const post = await Post.findById(report.targetId)
            .populate('journalist', 'name username email avatarUrl isVerified')
            .select('title type content createdAt views likes comments journalist _id');
          if (post) {
            // Get total reports count for this post
            const reportCount = await Report.countDocuments({ 
              targetId: report.targetId, 
              targetType: 'post' 
            });
              
            reportObj.targetDetails = {
              _id: post._id,
              title: post.title,
              content: post.content ? post.content.substring(0, 200) + '...' : '',
              journalist: post.journalist,
              type: post.type,
              createdAt: post.createdAt,
              views: post.views || 0,
              likes: post.likes || [],
              comments: post.comments || [],
              reportCount: reportCount
            };
          }
          break;
        }
        case 'comment': {
          const comment = await Comment.findById(report.targetId)
            .populate('author', 'name username email avatarUrl')
            .populate('post', 'title');
          if (comment) {
            const reportCount = await Report.countDocuments({ 
              targetId: report.targetId, 
              targetType: 'comment' 
            });
              
            reportObj.targetDetails = {
              _id: comment._id,
              content: comment.content,
              author: comment.author,
              post: comment.post,
              createdAt: comment.createdAt,
              reportCount: reportCount
            };
          }
          break;
        }
        case 'short': {
          const short = await Short.findById(report.targetId)
            .populate('author', 'name username email avatarUrl');
          if (short) {
            const reportCount = await Report.countDocuments({ 
              targetId: report.targetId, 
              targetType: 'short' 
            });
              
            reportObj.targetDetails = {
              _id: short._id,
              title: short.title,
              author: short.author,
              createdAt: short.createdAt,
              reportCount: reportCount
            };
          }
          break;
        }
        case 'user': {
          const user = await User.findById(report.targetId)
            .select('name username email avatarUrl createdAt role status');
          if (user) {
            const reportCount = await Report.countDocuments({
              targetId: report.targetId,
              targetType: 'user'
            });

            reportObj.targetDetails = {
              ...user.toObject(),
              reportCount: reportCount
            };
          }
          break;
        }
        }
      } catch (err) {
        console.error('Error populating target details:', err);
      }

      return reportObj;
    }));

    res.json({
      success: true,
      data: {
        reports: reportsWithDetails,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get reports',
      error: error.message
    });
  }
};

// Get all reports for a specific target
exports.getReportsByTarget = async (req, res) => {
  try {
    const { targetType, targetId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build query
    const query = {
      targetType,
      targetId
    };

    const [reports, total] = await Promise.all([
      Report.find(query)
        .populate('reportedBy', 'name username email avatarUrl')
        .populate('reviewedBy', 'name username email')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(skip),
      Report.countDocuments(query)
    ]);

    // Get target details
    let targetDetails = null;
    try {
      switch (targetType) {
      case 'post': {
        const post = await Post.findById(targetId)
          .populate('journalist', 'name username email avatarUrl isVerified')
          .select('title type content createdAt views likes comments journalist');
        if (post) {
          targetDetails = {
            _id: post._id,
            title: post.title,
            content: post.content ? post.content.substring(0, 500) + '...' : '',
            journalist: post.journalist,
            type: post.type,
            createdAt: post.createdAt,
            views: post.views || 0,
            likes: post.likes || [],
            comments: post.comments || []
          };
        }
        break;
      }
      case 'comment': {
        const comment = await Comment.findById(targetId)
          .populate('author', 'name username email avatarUrl')
          .populate('post', 'title');
        if (comment) {
          targetDetails = {
            _id: comment._id,
            content: comment.content,
            author: comment.author,
            post: comment.post,
            createdAt: comment.createdAt
          };
        }
        break;
      }
      case 'user': {
        const user = await User.findById(targetId)
          .select('name username email avatarUrl createdAt role status');
        if (user) {
          targetDetails = user.toObject();
        }
        break;
      }
      }
    } catch (err) {
      console.error('Error getting target details:', err);
    }

    // Group reports by reason
    const reportsByReason = reports.reduce((acc, report) => {
      const reason = report.reason || 'other';
      if (!acc[reason]) {
        acc[reason] = [];
      }
      acc[reason].push(report);
      return acc;
    }, {});

    // Get unique reporters count
    const uniqueReporters = new Set(reports.map(r => r.reportedBy?._id?.toString())).size;

    res.json({
      success: true,
      data: {
        targetDetails,
        reports,
        reportsByReason,
        stats: {
          totalReports: total,
          uniqueReporters,
          pending: reports.filter(r => r.status === 'pending').length,
          reviewed: reports.filter(r => r.status === 'reviewed').length,
          resolved: reports.filter(r => r.status === 'resolved').length,
          dismissed: reports.filter(r => r.status === 'dismissed').length
        },
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get reports by target error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get reports for target',
      error: error.message
    });
  }
};
