const mongoose = require('mongoose');

const shortSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  videoUrl: {
    type: String,
    required: true
  },
  thumbnailUrl: {
    type: String,
    required: true
  },
  imageUrl: {
    type: String,
    required: true
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  dislikes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  comments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment'
  }],
  views: {
    type: Number,
    default: 0
  },
  duration: {
    type: Number,
    required: true
  },
  hashtags: [{
    type: String
  }],
  category: {
    type: String,
    default: 'general'
  },
  politicalView: {
    type: String,
    enum: ['extremelyConservative', 'conservative', 'neutral', 'progressive', 'extremelyProgressive'],
    required: true
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date,
  deletionReason: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Virtual fields
shortSchema.virtual('likesCount').get(function() {
  return this.likes.length;
});

shortSchema.virtual('dislikesCount').get(function() {
  return this.dislikes.length;
});

shortSchema.virtual('commentsCount').get(function() {
  return this.comments.length;
});

// Methods
shortSchema.methods.like = async function(userId) {
  if (!this.likes.includes(userId)) {
    // Remove from dislikes if present
    this.dislikes = this.dislikes.filter(id => !id.equals(userId));
    this.likes.push(userId);
    await this.save();
  }
};

shortSchema.methods.dislike = async function(userId) {
  if (!this.dislikes.includes(userId)) {
    // Remove from likes if present
    this.likes = this.likes.filter(id => !id.equals(userId));
    this.dislikes.push(userId);
    await this.save();
  }
};

shortSchema.methods.addComment = async function(commentId) {
  if (!this.comments.includes(commentId)) {
    this.comments.push(commentId);
    await this.save();
  }
};

shortSchema.methods.incrementViews = async function() {
  this.views += 1;
  await this.save();
};

// Configure toJSON
shortSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret._v;
    return ret;
  }
});

module.exports = mongoose.model('Short', shortSchema);
