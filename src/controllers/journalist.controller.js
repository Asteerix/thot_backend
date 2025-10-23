/* eslint-disable */
const mongoose = require('mongoose');
const Post = require('../models/post.model');
const User = require('../models/user.model');
const Comment = require('../models/comment.model');
const { buildMediaUrl } = require('../utils/urlHelper');

/**
 * Add formation to journalist profile
 */
exports.addFormation = async (req, res) => {
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
};

/**
 * Update formation
 */
exports.updateFormation = async (req, res) => {
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
};

/**
 * Delete formation
 */
exports.deleteFormation = async (req, res) => {
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
};

/**
 * Add experience to journalist profile
 */
exports.addExperience = async (req, res) => {
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
};

/**
 * Update experience
 */
exports.updateExperience = async (req, res) => {
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
};

/**
 * Delete experience
 */
exports.deleteExperience = async (req, res) => {
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
};

/**
 * Get current journalist profile
 */
exports.getMe = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(404).json({
        success: false,
        message: 'Journalist profile not found'
      });
    }

    const profile = req.user.getPublicProfile();
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
};

/**
 * Get journalist's posts
 */
exports.getMyPosts = async (req, res) => {
  try {
    const { page = 1, limit = 20, status = 'published', type } = req.query;
    const query = { journalist: req.user._id };

    if (status) query.status = status;
    if (type) query.type = type;

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

    const postsWithAbsoluteUrls = posts.map(post => {
      const postObj = post.toObject();
      postObj._id = post._id.toString();
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
};

/**
 * Get all journalists
 */
exports.getAllJournalists = async (req, res) => {
  try {
    const { page = 1, limit = 20, specialty, suggested, search } = req.query;
    const skip = (page - 1) * limit;
    let sort = { 'stats.postsCount': -1 };

    const baseQuery = {
      _id: { $ne: req.user._id }
    };

    if (search && search.trim()) {
      baseQuery.$or = [
        { name: { $regex: search.trim(), $options: 'i' } },
        { username: { $regex: search.trim(), $options: 'i' } },
        { organization: { $regex: search.trim(), $options: 'i' } }
      ];
    }

    let excludedIds = [req.user._id];
    if (suggested === 'true') {
      const currentUser = await User.findById(req.user._id).select('followedJournalists');

      if (currentUser && currentUser.followedJournalists && currentUser.followedJournalists.length > 0) {
        excludedIds = [...excludedIds, ...currentUser.followedJournalists];
      }

      sort = { 'stats.followers': -1, 'stats.postsCount': -1 };
    }

    const userQuery = { ...baseQuery, role: 'journalist' };
    if (specialty) {
      userQuery.specialties = specialty;
    }
    if (excludedIds.length > 0) {
      userQuery._id = { $nin: excludedIds };
    }

    const userJournalistResults = await User.find(userQuery).sort({ 'stats.followers': -1 });

    const allJournalists = [];

    userJournalistResults.forEach(user => {
      const profile = user.getPublicProfile(req.user);
      profile.avatarUrl = buildMediaUrl(req, profile.avatarUrl, '/assets/images/defaults/default_journalist_avatar.png');
      profile.coverUrl = buildMediaUrl(req, profile.coverUrl);
      profile.isJournalist = true;
      profile.type = 'journalist';
      allJournalists.push(profile);
    });

    allJournalists.sort((a, b) => {
      if (suggested === 'true') {
        return (b.followersCount || 0) - (a.followersCount || 0);
      }
      return (b.stats?.postes || 0) - (a.stats?.postes || 0);
    });

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
};

/**
 * Get specific journalist profile
 */
exports.getJournalistProfile = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, role: 'journalist' });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Journalist not found'
      });
    }

    const profile = user.getPublicProfile(req.user);
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
};

// Les autres fonctions suivent...
// (Je continue dans un prochain message car le fichier est trop long)

module.exports = exports;