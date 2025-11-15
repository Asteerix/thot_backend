/**
 * Post Model
 *
 * Unified model for ALL content types: article, video, podcast, short, question, etc.
 *
 * Key Architecture Decisions:
 * 1. Single polymorphic model with 'type' field (10 possible types)
 * 2. Type-specific data stored in 'metadata' field (article, video, podcast, etc.)
 * 3. Political orientation with user voting system (politicalOrientation field)
 * 4. Interactions denormalized: bookmarks.users[] synced with User.interactions.savedPosts
 * 5. journalist field references User model (there is NO separate Journalist model)
 *
 * Performance:
 * - Indexes on journalist, type, domain, status for fast queries
 * - Interaction counts cached (likes.count, bookmarks.count) for performance
 * - Atomic operations used in interactions.controller.js to prevent race conditions
 */

const mongoose = require('mongoose');

const postStatsSchema = new mongoose.Schema({
  views: { type: Number, default: 0 },
  responses: { type: Number, default: 0 },
  shares: { type: Number, default: 0 },
  readTime: { type: Number }, // in minutes
  completion: { type: Number, default: 0 }, // percentage of users who finished
  engagement: { type: Number, default: 0 } // time spent/interactions
});

const politicalOrientationSchema = new mongoose.Schema({
  journalistChoice: {
    type: String,
    enum: [
      'extremelyConservative',
      'conservative',
      'neutral',
      'progressive',
      'extremelyProgressive'
    ],
    required: true
  },
  userVotes: {
    extremelyConservative: { type: Number, default: 0 },
    conservative: { type: Number, default: 0 },
    neutral: { type: Number, default: 0 },
    progressive: { type: Number, default: 0 },
    extremelyProgressive: { type: Number, default: 0 }
  },
  finalScore: { type: Number, default: 0 }, // Weighted average of votes
  dominantView: {
    type: String,
    enum: [
      'extremelyConservative',
      'conservative',
      'neutral',
      'progressive',
      'extremelyProgressive'
    ]
  },
  voters: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      view: {
        type: String,
        enum: [
          'extremelyConservative',
          'conservative',
          'neutral',
          'progressive',
          'extremelyProgressive'
        ],
        required: true
      },
      votedAt: {
        type: Date,
        default: Date.now
      }
    }
  ]
});

const articleMetadataSchema = new mongoose.Schema({
  wordCount: Number,
  sources: [String],
  citations: [String],
  relatedArticles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }]
});

const videoMetadataSchema = new mongoose.Schema({
  duration: Number, // in seconds
  quality: String,
  transcript: String,
  hash: String, // SHA-256 hash for duplicate detection
  size: Number, // in bytes
  width: Number,
  height: Number,
  original_name: String,
  original_extension: String,
  chapters: [
    {
      title: String,
      timestamp: Number
    }
  ]
});

const podcastMetadataSchema = new mongoose.Schema({
  duration: Number,
  transcript: String,
  guests: [String],
  segments: [
    {
      title: String,
      timestamp: Number,
      description: String
    }
  ]
});

const liveMetadataSchema = new mongoose.Schema({
  scheduledStart: Date,
  actualStart: Date,
  actualEnd: Date,
  participants: Number,
  chatEnabled: { type: Boolean, default: true },
  replayAvailable: { type: Boolean, default: false }
});

const shortMetadataSchema = new mongoose.Schema({
  duration: Number, // in seconds
  views: { type: Number, default: 0 },
  likes: { type: Number, default: 0 }
});

const questionMetadataSchema = new mongoose.Schema({
  questionType: {
    type: String,
    enum: ['poll', 'openEnded'],
    default: 'poll'
  },
  options: [
    {
      text: String,
      votes: { type: Number, default: 0 }
    }
  ],
  totalVotes: { type: Number, default: 0 },
  isMultipleChoice: { type: Boolean, default: false },
  endDate: Date,
  allowComments: { type: Boolean, default: true },
  voters: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      optionIds: [{
        type: mongoose.Schema.Types.ObjectId,
        required: true
      }],
      votedAt: {
        type: Date,
        default: Date.now
      }
    }
  ]
});

const testimonyMetadataSchema = new mongoose.Schema({
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'disputed'],
    default: 'pending'
  },
  verificationDetails: String,
  location: String,
  date: Date,
  supportingDocs: [String]
});

const documentationMetadataSchema = new mongoose.Schema({
  sections: [
    {
      title: String,
      content: String
    }
  ],
  references: [String],
  contributors: [String],
  lastUpdated: Date
});

const opinionMetadataSchema = new mongoose.Schema({
  mainArguments: [String],
  counterArguments: [String],
  sources: [String],
  expertOpinions: [
    {
      expert: String,
      opinion: String,
      credentials: String
    }
  ]
});

const postSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    imageUrl: {
      type: String,
      required: function () {
        return this.type !== 'video' && this.type !== 'short' && this.type !== 'podcast';
      },
      validate: {
        validator: function (_value) {
          // Aspect ratio validation will be handled by the upload controller
          return true;
        }
      }
    },
    thumbnailUrl: {
      type: String,
      required: function () {
        return this.type === 'video' || this.type === 'short';
      }
    },
    videoUrl: {
      type: String,
      required: function () {
        return (
          this.type === 'short' ||
          this.type === 'video' ||
          this.type === 'podcast'
        );
      }
    },
    type: {
      type: String,
      enum: [
        'article',
        'video',
        'podcast',
        'short',
        'question',
        'live',
        'poll',
        'testimony',
        'documentation',
        'opinion'
      ],
      required: true
    },
    domain: {
      type: String,
      enum: [
        'politique',
        'economie',
        'science',
        'international',
        'juridique',
        'philosophie',
        'societe',
        'psychologie',
        'sport',
        'technologie'
      ],
      required: true
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived', 'hidden', 'deleted'],
      default: 'draft'
    },
    politicalOrientation: {
      type: politicalOrientationSchema,
      required: true
    },
    journalist: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    stats: {
      type: postStatsSchema,
      default: () => ({
        views: 0,
        responses: 0
      })
    },
    isDeleted: {
      type: Boolean,
      default: false
    },
    deletedAt: Date,
    deletionReason: String,
    interactions: {
      likes: {
        users: [
          {
            user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            createdAt: { type: Date, default: Date.now }
          }
        ],
        count: { type: Number, default: 0 }
      },
      dislikes: {
        users: [
          {
            user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            createdAt: { type: Date, default: Date.now }
          }
        ],
        count: { type: Number, default: 0 }
      },
      comments: {
        users: [
          {
            user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            createdAt: { type: Date, default: Date.now }
          }
        ],
        count: { type: Number, default: 0 }
      },
      reports: {
        users: [
          {
            user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            reason: {
              type: String,
              enum: [
                'spam',
                'inappropriate',
                'violence',
                'hate_speech',
                'misinformation',
                'other'
              ],
              required: true
            },
            description: String,
            createdAt: { type: Date, default: Date.now }
          }
        ],
        count: { type: Number, default: 0 }
      },
      // bookmarks: Users who bookmarked this post (source of truth)
      // Synchronized with User.interactions.savedPosts (denormalization)
      // Managed atomically by toggleBookmark in interactions.controller.js
      bookmarks: {
        users: [
          {
            user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            createdAt: { type: Date, default: Date.now }
          }
        ],
        count: { type: Number, default: 0 }
      }
    },
    content: {
      type: String,
      required: true
    },
    metadata: {
      article: articleMetadataSchema,
      video: videoMetadataSchema,
      podcast: podcastMetadataSchema,
      live: liveMetadataSchema,
      short: shortMetadataSchema,
      question: questionMetadataSchema,
      testimony: testimonyMetadataSchema,
      documentation: documentationMetadataSchema,
      opinion: opinionMetadataSchema
    },
    tags: [String],
    hashtags: [String],
    sources: [String],
    relatedPosts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post'
      }
    ],
    opposingPosts: [
      {
        postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
        description: { type: String, default: '' }
      }
    ],
    opposedByPosts: [
      {
        postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
        description: { type: String, default: '' }
      }
    ],
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// Calculate dominant view from user votes
function calculateDominantView(userVotes) {
  if (!userVotes) {
    return null;
  }

  const votes = [
    { view: 'extremelyConservative', count: userVotes.extremelyConservative || 0, score: -2 },
    { view: 'conservative', count: userVotes.conservative || 0, score: -1 },
    { view: 'neutral', count: userVotes.neutral || 0, score: 0 },
    { view: 'progressive', count: userVotes.progressive || 0, score: 1 },
    { view: 'extremelyProgressive', count: userVotes.extremelyProgressive || 0, score: 2 }
  ];

  const totalVotes = votes.reduce((sum, v) => sum + v.count, 0);
  if (totalVotes === 0) {
    return null;
  }

  // Calculate weighted median
  const sortedVotes = votes.sort((a, b) => a.score - b.score);
  const medianPosition = totalVotes / 2;
  let cumulative = 0;

  for (const vote of sortedVotes) {
    cumulative += vote.count;
    if (cumulative >= medianPosition) {
      return vote.view;
    }
  }

  return null;
}

// Initialize stats and interactions if they're null
postSchema.pre('save', function (next) {
  this.updatedAt = Date.now();

  if (!this.stats) {
    this.stats = {
      views: 0,
      responses: 0
    };
  }

  if (!this.interactions) {
    this.interactions = {
      likes: { users: [], count: 0 },
      dislikes: { users: [], count: 0 },
      comments: { users: [], count: 0 },
      reports: { users: [], count: 0 },
      bookmarks: { users: [], count: 0 }
    };
  }

  // Calculate and update dominantView if political orientation exists
  if (this.politicalOrientation && this.politicalOrientation.userVotes) {
    const dominant = calculateDominantView(this.politicalOrientation.userVotes);
    if (dominant) {
      this.politicalOrientation.dominantView = dominant;
    }
  }

  next();
});

// Static methods
postSchema.statics.findByType = function (type) {
  return this.find({ type });
};

postSchema.statics.findByStatus = function (status) {
  return this.find({ status });
};

// Instance methods
postSchema.methods.updateStats = async function (stats) {
  if (!this.stats) {
    this.stats = {
      views: 0,
      responses: 0
    };
  }
  Object.assign(this.stats, stats);
  return this.save();
};

// Get public data with flattened interactions
postSchema.methods.getPublicData = function (userId) {
  const interactions = this.interactions || {};
  const isLiked = userId && interactions.likes?.users?.some(like => like.user.toString() === userId.toString());
  const isDisliked = userId && interactions.dislikes?.users?.some(dislike => dislike.user.toString() === userId.toString());
  const isBookmarked = userId && interactions.bookmarks?.users?.some(bookmark => bookmark.user.toString() === userId.toString());

  return {
    id: this._id.toString(),
    title: this.title,
    imageUrl: this.imageUrl,
    thumbnailUrl: this.thumbnailUrl,
    videoUrl: this.videoUrl,
    type: this.type,
    domain: this.domain,
    status: this.status,
    politicalOrientation: this.politicalOrientation,
    journalist: this.journalist,
    stats: this.stats,
    interactions: {
      likesCount: interactions.likes?.count || 0,
      dislikesCount: interactions.dislikes?.count || 0,
      commentsCount: interactions.comments?.count || 0,
      bookmarksCount: interactions.bookmarks?.count || 0,
      reportsCount: interactions.reports?.count || 0,
      isLiked: !!isLiked,
      isDisliked: !!isDisliked,
      isBookmarked: !!isBookmarked
    },
    content: this.content,
    metadata: this.metadata,
    tags: this.tags,
    hashtags: this.hashtags,
    sources: this.sources,
    relatedPosts: this.relatedPosts,
    opposingPosts: this.opposingPosts,
    opposedByPosts: this.opposedByPosts,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

// Indexes for better performance and data integrity
postSchema.index({ journalist: 1, createdAt: -1 });
postSchema.index({ type: 1, status: 1, createdAt: -1 });
postSchema.index({ domain: 1, status: 1, createdAt: -1 });
postSchema.index({ type: 1, domain: 1, status: 1, createdAt: -1 }); // Compound index for complex queries
postSchema.index({ status: 1, createdAt: -1 });
postSchema.index({ 'interactions.likes.users.user': 1 });
postSchema.index({ 'interactions.bookmarks.users.user': 1 });
postSchema.index({ 'politicalOrientation.voters.userId': 1 });

// Compound index for ensuring unique votes on political orientation
postSchema.index(
  {
    '_id': 1,
    'politicalOrientation.voters.userId': 1
  },
  {
    unique: true,
    partialFilterExpression: { 'politicalOrientation.voters.userId': { $exists: true } }
  }
);

// Compound index for question voters
postSchema.index(
  {
    '_id': 1,
    'metadata.question.voters.userId': 1
  },
  {
    unique: true,
    partialFilterExpression: { 'metadata.question.voters.userId': { $exists: true } }
  }
);

module.exports = mongoose.model('Post', postSchema);
