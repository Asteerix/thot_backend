const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  targetType: {
    type: String,
    enum: ['post', 'comment', 'short', 'user'],
    required: true
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'targetModel'
  },
  targetModel: {
    type: String,
    required: true,
    enum: ['Post', 'Comment', 'Short', 'User']
  },
  reason: {
    type: String,
    enum: [
      'spam',
      'harassment',
      'hate_speech',
      'violence',
      'false_information',
      'inappropriate_content',
      'copyright',
      'other'
    ],
    required: true
  },
  description: {
    type: String,
    maxlength: 500
  },
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'resolved', 'dismissed'],
    default: 'pending'
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: Date,
  actionTaken: {
    type: String,
    enum: ['none', 'warning', 'content_removed', 'user_suspended', 'user_banned']
  }
}, {
  timestamps: true
});

reportSchema.index({ reportedBy: 1, targetId: 1 }, { unique: true });
reportSchema.index({ targetType: 1, targetId: 1 });
reportSchema.index({ status: 1 });
reportSchema.index({ createdAt: 1 });

reportSchema.statics.getReportStats = async function(targetType, targetId) {
  const totalReports = await this.countDocuments({ targetType, targetId });
  const uniqueReporters = await this.distinct('reportedBy', { targetType, targetId });
  const reportsByReason = await this.aggregate([
    { $match: { targetType, targetId } },
    { $group: { _id: '$reason', count: { $sum: 1 } } }
  ]);

  return {
    totalReports,
    uniqueReporters: uniqueReporters.length,
    reportsByReason
  };
};

reportSchema.statics.checkAutoRemovalThreshold = async function(targetType, targetId) {
  const target = await mongoose.model(
    targetType.charAt(0).toUpperCase() + targetType.slice(1)
  ).findById(targetId);

  if (!target) {
    return null;
  }

  const createdAt = target.createdAt || new Date();
  const hoursElapsed = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);

  if (hoursElapsed < 24) {
    return { shouldRemove: false, reason: 'Content is less than 24 hours old' };
  }

  const stats = await this.getReportStats(targetType, targetId);

  let totalUsers = 0;
  if (targetType === 'post' || targetType === 'comment') {
    totalUsers = await mongoose.model('User').countDocuments({ isActive: true });
  } else if (targetType === 'short') {
    totalUsers = await mongoose.model('User').countDocuments({ isActive: true });
  }

  const reportPercentage = (stats.uniqueReporters / totalUsers) * 100;

  const thresholds = {
    post: { percentage: 5, minReports: 10 },
    comment: { percentage: 3, minReports: 5 },
    short: { percentage: 5, minReports: 10 },
    user: { percentage: 10, minReports: 20 }
  };

  const threshold = thresholds[targetType];
  const shouldRemove = reportPercentage >= threshold.percentage &&
                      stats.uniqueReporters >= threshold.minReports;

  const severeReasons = ['hate_speech', 'violence', 'harassment'];
  const severeReportsCount = stats.reportsByReason
    .filter(r => severeReasons.includes(r._id))
    .reduce((sum, r) => sum + r.count, 0);

  const severeReportsPercentage = (severeReportsCount / stats.totalReports) * 100;
  const hasSevereReports = severeReportsPercentage >= 60;

  return {
    shouldRemove: shouldRemove || hasSevereReports,
    stats: {
      reportPercentage,
      uniqueReporters: stats.uniqueReporters,
      totalReports: stats.totalReports,
      reportsByReason: stats.reportsByReason,
      severeReportsPercentage,
      threshold: threshold.percentage,
      minReports: threshold.minReports
    },
    reason: shouldRemove ?
      `Content exceeded report threshold: ${reportPercentage.toFixed(2)}% of users reported` :
      hasSevereReports ?
        `High percentage of severe reports: ${severeReportsPercentage.toFixed(2)}%` :
        'Threshold not met'
  };
};

module.exports = mongoose.model('Report', reportSchema);
