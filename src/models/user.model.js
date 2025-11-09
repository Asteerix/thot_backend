/**
 * User Model
 *
 * This is the ONLY user model in the system.
 * There is NO separate Journalist model - journalists are Users with role='journalist'.
 *
 * Key Architecture Decisions:
 * 1. Unified model for users, journalists, and admins (role-based)
 * 2. Conditional validation based on role (e.g., username required for users, not journalists)
 * 3. Stats structure: nested in DB (stats.postsCount) but FLATTENED in API responses
 * 4. Bookmarks: denormalized (interactions.savedPosts mirrors Post.interactions.bookmarks)
 * 5. likedPosts: stored outside interactions for historical reasons (consider refactoring)
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const formationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  institution: {
    type: String,
    required: true,
    trim: true
  },
  year: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    trim: true
  }
});

const experienceSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  company: {
    type: String,
    required: true,
    trim: true
  },
  location: {
    type: String,
    trim: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date
  },
  current: {
    type: Boolean,
    default: false
  },
  description: {
    type: String,
    trim: true
  }
});

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: function () {
        return this.role !== 'journalist';
      },
      unique: true,
      sparse: true,
      trim: true,
      minlength: 3,
      validate: {
        validator: function(v) {
          // Les journalistes n'ont pas besoin de username
          if (this.role === 'journalist') {
            return true;
          }
          // Pour les autres, le username est requis et doit être valide
          return v && v.match(/^[a-zA-Z0-9_]+$/);
        },
        message: 'Username can only contain letters, numbers and underscores'
      }
    },
    name: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },
    password: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: ['user', 'admin', 'journalist'],
      default: 'user'
    },
    avatarUrl: {
      type: String,
      default: ''
    },
    coverUrl: {
      type: String,
      default: null
    },
    // Journalist specific fields
    organization: {
      type: String,
      default: function () {
        return this.role === 'journalist' ? 'indépendant' : undefined;
      }
    },
    pressCard: {
      type: String,
      required: false, // Optionnel
      validate: {
        validator: function(v) {
          // Si une carte de presse est fournie, elle doit avoir au moins 4 chiffres
          return !v || /^\d{4,}$/.test(v);
        },
        message: 'Le numéro de carte de presse doit contenir au moins 4 chiffres'
      }
    },
    isVerified: {
      type: Boolean,
      default: false
    },
    bio: {
      type: String,
      trim: true,
      maxLength: 160
    },
    location: {
      type: String,
      trim: true,
      maxLength: 100
    },
    journalistRole: {
      type: String,
      trim: true,
      required: function () {
        return this.role === 'journalist';
      },
      default: function () {
        return this.role === 'journalist' ? 'journalist' : undefined;
      }
    },
    socialLinks: {
      website: {
        type: String,
        trim: true
      },
      linkedin: {
        type: String,
        trim: true
      },
      twitter: {
        type: String,
        trim: true
      }
    },
    formations: [formationSchema],
    experience: [experienceSchema],
    specialties: [
      {
        type: String,
        trim: true
      }
    ],
    questions: [
      {
        title: String,
        description: String,
        type: {
          type: String,
          enum: ['poll', 'testimony', 'documentation', 'opinionExchange']
        },
        options: [String],
        documentationType: String,
        hasEmailResponse: Boolean,
        attachments: [String],
        responseCount: {
          type: Number,
          default: 0
        },
        createdBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        createdAt: {
          type: Date,
          default: Date.now
        },
        answers: [
          {
            text: String,
            answeredBy: {
              type: mongoose.Schema.Types.ObjectId,
              ref: 'User'
            },
            answeredAt: {
              type: Date,
              default: Date.now
            }
          }
        ]
      }
    ],
    preferences: {
      topics: [
        {
          type: String,
          trim: true
        }
      ],
      notifications: {
        enabled: {
          type: Boolean,
          default: true
        },
        // Types de notifications
        likes: {
          type: Boolean,
          default: true
        },
        comments: {
          type: Boolean,
          default: true
        },
        follows: {
          type: Boolean,
          default: true
        },
        mentions: {
          type: Boolean,
          default: true
        },
        posts: {
          type: Boolean,
          default: true
        },
        polls: {
          type: Boolean,
          default: true
        },
        // Son des notifications
        sound: {
          type: Boolean,
          default: true
        }
      },
      darkMode: {
        type: Boolean,
        default: true
      }
    },
    politicalViews: {
      type: Map,
      of: String,
      default: {}
    },
    // likedPosts: Posts liked by this user (denormalized for quick access)
    // Note: This field exists outside 'interactions' for historical reasons
    // Consider moving to interactions.likedPosts in future refactor for consistency
    likedPosts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post',
        default: []
      }
    ],
    stats: {
      postsCount: {
        type: Number,
        default: 0
      },
      commentsCount: {
        type: Number,
        default: 0
      },
      reactionsCount: {
        type: Number,
        default: 0
      },
      followersCount: {
        type: Number,
        default: 0
      },
      followingCount: {
        type: Number,
        default: 0
      }
    },
    followers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    following: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended', 'banned'],
      default: 'active'
    },
    lastActive: {
      type: Date,
      default: Date.now
    },
    // Admin-related fields
    suspensionReason: String,
    suspendedAt: Date,
    suspendedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    suspendedUntil: Date,
    // Ban-related fields
    banReason: String,
    bannedAt: Date,
    bannedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    unbannedAt: Date,
    unbannedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    // User privacy and content management
    isPrivate: {
      type: Boolean,
      default: false
    },
    highlightedStories: [{
      type: String,
      trim: true
    }],
    interactions: {
      // bookmarks: Bookmarked posts by this user
      // Synchronized with Post.interactions.bookmarks (denormalization for performance)
      // Source of truth: Post.interactions.bookmarks
      // Managed atomically by toggleBookmark in interactions.controller.js
      bookmarks: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post'
      }],
      // DEPRECATED: Use bookmarks instead - kept for backward compatibility
      savedPosts: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post'
      }],
      readHistory: [{
        post: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Post'
        },
        readAt: {
          type: Date,
          default: Date.now
        }
      }],
      publicContent: {
        posts: [{
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Post'
        }],
        shorts: [{
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Short'
        }],
        questions: [{
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Post'
        }]
      }
    }
  },
  {
    timestamps: true
  }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  // Auto-verify journalists with press card
  if (this.role === 'journalist' && this.pressCard && this.pressCard.length >= 4) {
    this.isVerified = true;
  }

  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};


/**
 * Get public profile for API responses
 *
 * Architecture note: There is NO separate Journalist model.
 * Journalists are Users with role='journalist' and additional fields.
 *
 * Returns flattened stats structure (postsCount, followersCount, etc.)
 * instead of nested stats object for mobile compatibility.
 *
 * @param {User} user - The requesting user (for isFollowing calculation)
 * @returns {Object} Public profile data
 */
userSchema.methods.getPublicProfile = function (user = null) {
  const isJournalist = this.role === 'journalist';
  const followersCount = this.followers?.length || 0;
  const followingCount = this.following?.length || 0;

  const profile = {
    id: this._id,
    username: this.username || this.name,
    name: this.name || this.username,
    avatarUrl: this.avatarUrl,
    coverUrl: this.coverUrl,
    bio: this.bio,
    location: this.location,
    role: this.role,
    isVerified: this.isVerified,
    preferences: {
      topics: this.preferences?.topics || []
    },
    // Flat structure for stats matching mobile expectations
    postsCount: isJournalist ? (this.stats?.postsCount || 0) : 0,
    commentsCount: this.stats?.commentsCount || 0,
    reactionsCount: this.stats?.reactionsCount || 0,
    followersCount: this.stats?.followersCount || followersCount,
    followingCount: this.stats?.followingCount || followingCount,
    status: this.status,
    lastActive: this.lastActive,
    type: isJournalist ? 'journalist' : 'regular',
    isJournalist,
    isFollowing: user ? this.followers.some(id => id.toString() === user._id.toString()) : false,
    isPrivate: this.isPrivate || false,
    highlightedStories: this.highlightedStories || []
  };

  // Add journalist specific fields
  if (isJournalist) {
    Object.assign(profile, {
      organization: this.organization,
      pressCard: this.pressCard,
      specialties: this.specialties || [],
      journalistRole: this.journalistRole,
      socialLinks: this.socialLinks,
      formations: this.formations || [],
      experience: this.experience || []
    });
  }

  return profile;
};

// Save post to reading list
userSchema.methods.savePost = async function (postId) {
  if (!this.savedPosts.includes(postId)) {
    this.savedPosts.push(postId);
    await this.save();
  }
  return this;
};

// Follow user or journalist
userSchema.methods.followUser = async function (targetUserId) {
  const User = require('./user.model');
  const NotificationService = require('../services/notification.service');
  const targetUser = await User.findById(targetUserId);

  if (!targetUser) {
    throw new Error('User not found');
  }

  const isAlreadyFollowing = this.following.some(
    (id) => id.toString() === targetUserId.toString()
  );

  if (!isAlreadyFollowing) {
    this.following.push(targetUserId);
    targetUser.followers.push(this._id);
    await Promise.all([this.save(), targetUser.save()]);
    await NotificationService.notifyFollow(this._id, targetUserId);
  }

  return targetUser.followers.length;
};

// Unfollow user or journalist
userSchema.methods.unfollowUser = async function (targetUserId) {
  const User = require('./user.model');
  const targetUser = await User.findById(targetUserId);

  if (!targetUser) {
    throw new Error('User not found');
  }

  const isFollowing = this.following.some(
    (id) => id.toString() === targetUserId.toString()
  );

  if (isFollowing) {
    this.following = this.following.filter(
      (id) => id.toString() !== targetUserId.toString()
    );
    targetUser.followers = targetUser.followers.filter(
      (id) => id.toString() !== this._id.toString()
    );
    await Promise.all([this.save(), targetUser.save()]);
  }

  return targetUser.followers.length;
};

// Add to read history
userSchema.methods.addToReadHistory = async function (postId) {
  if (!this.readHistory) {
    this.readHistory = [];
  }
  this.readHistory.push({
    post: postId,
    readAt: Date.now()
  });
  await this.save();
  return this;
};

// Update last active
userSchema.methods.updateLastActive = function () {
  this.lastActive = Date.now();
  return this.save();
};

module.exports = mongoose.model('User', userSchema);
