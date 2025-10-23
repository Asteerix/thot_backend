const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: {
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
  votes: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    option: {
      type: mongoose.Schema.Types.ObjectId
    }
  }],
  options: [{
    text: String,
    votes: { type: Number, default: 0 }
  }],
  politicalView: {
    type: String,
    enum: ['extremelyConservative', 'conservative', 'neutral', 'progressive', 'extremelyProgressive'],
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Virtual fields
questionSchema.virtual('likesCount').get(function() {
  return this.likes.length;
});

questionSchema.virtual('dislikesCount').get(function() {
  return this.dislikes.length;
});

questionSchema.virtual('commentsCount').get(function() {
  return this.comments.length;
});

// Methods
questionSchema.methods.like = async function(userId) {
  if (!this.likes.includes(userId)) {
    // Remove from dislikes if present
    this.dislikes = this.dislikes.filter(id => !id.equals(userId));
    this.likes.push(userId);
    await this.save();
  }
};

questionSchema.methods.dislike = async function(userId) {
  if (!this.dislikes.includes(userId)) {
    // Remove from likes if present
    this.likes = this.likes.filter(id => !id.equals(userId));
    this.dislikes.push(userId);
    await this.save();
  }
};

questionSchema.methods.addComment = async function(commentId) {
  if (!this.comments.includes(commentId)) {
    this.comments.push(commentId);
    await this.save();
  }
};

// Configure toJSON
questionSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret._v;
    return ret;
  }
});

module.exports = mongoose.model('Question', questionSchema);
