const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    required: true
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
    // Note: Always populate author when querying comments to avoid mobile crashes
    // Use: Comment.find().populate('author', 'username name avatarUrl isVerified role')
  },
  parentComment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    default: null
  },
  likes: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  reports: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: {
      type: String,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  status: {
    type: String,
    enum: ['active', 'hidden', 'deleted'],
    default: 'active'
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date,
  deletionReason: String,
  isEdited: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Virtual for reply count
commentSchema.virtual('replyCount', {
  ref: 'Comment',
  localField: '_id',
  foreignField: 'parentComment',
  count: true
});

// Ensure virtuals are included in toJSON and toObject
commentSchema.set('toJSON', { virtuals: true });
commentSchema.set('toObject', { virtuals: true });

// Add indexes
commentSchema.index({ post: 1, createdAt: -1 });
commentSchema.index({ author: 1 });
commentSchema.index({ parentComment: 1 });

// Auto-populate author on all find queries
// This prevents mobile crashes when author is not populated
commentSchema.pre(/^find/, function(next) {
  // Skip auto-populate if explicitly disabled
  if (!this.getOptions().skipAutopopulate) {
    this.populate('author', 'username name avatarUrl isVerified role');
  }
  next();
});

// Static methods
commentSchema.statics.findByPost = function(postId) {
  return this.find({ post: postId, status: 'active', isDeleted: { $ne: true } })
    .sort({ createdAt: -1 })
    .populate('author', 'name username avatarUrl');
};

commentSchema.statics.findByAuthor = function(authorId) {
  return this.find({ author: authorId, status: 'active', isDeleted: { $ne: true } })
    .sort({ createdAt: -1 })
    .populate('post', 'title');
};

// Instance methods

commentSchema.methods.report = async function(userId, reason) {
  if (!this.reports.some(report => report.user.toString() === userId.toString())) {
    this.reports.push({ user: userId, reason });

    // Auto-hide comment if it reaches report threshold
    if (this.reports.length >= 5) {
      this.status = 'hidden';
    }

    await this.save();
  }
  return this;
};

commentSchema.methods.getPublicData = function(userId) {
  const authorId = this.author?._id || this.author;
  const isLiked = userId ? this.likes.some(like => like.user.toString() === userId.toString()) : false;
  const likesCount = this.likes ? this.likes.length : 0;

  return {
    id: this._id.toString(),
    postId: this.post.toString(),
    content: this.content,
    likesCount: likesCount,
    isLiked,
    replyCount: 0,
    parentCommentId: this.parentComment ? this.parentComment.toString() : null,
    status: this.status,
    isEdited: this.isEdited || false,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    author: this.author?._id ? {
      id: authorId.toString(),
      username: this.author.username,
      name: this.author.name || this.author.fullName,
      avatarUrl: this.author.avatarUrl,
      isVerified: this.author.verified || this.author.isVerified || false,
      role: this.author.role || 'user'
    } : null
  };
};

module.exports = mongoose.model('Comment', commentSchema);
