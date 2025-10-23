const mongoose = require('mongoose');

const problemReportSchema = new mongoose.Schema({
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  category: {
    type: String,
    enum: ['sécurité', 'fonctionnalité', 'performance', 'interface', 'autre'],
    required: true
  },
  subCategory: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true,
    maxlength: 1000
  },
  platform: {
    type: String,
    default: 'unknown'
  },
  appVersion: {
    type: String,
    default: 'unknown'
  },
  userAgent: {
    type: String
  },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'resolved', 'dismissed', 'need_more_info'],
    default: 'pending'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: Date,
  resolution: {
    type: String,
    maxlength: 500
  },
  screenshots: [{
    type: String // URLs to uploaded screenshots
  }],
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
problemReportSchema.index({ reportedBy: 1 });
problemReportSchema.index({ category: 1 });
problemReportSchema.index({ status: 1 });
problemReportSchema.index({ priority: 1 });
problemReportSchema.index({ createdAt: -1 });

// Methods
problemReportSchema.methods.updateStatus = async function(status, reviewerId, resolution) {
  this.status = status;
  this.reviewedBy = reviewerId;
  this.reviewedAt = new Date();
  if (resolution) {
    this.resolution = resolution;
  }
  return this.save();
};

// Statics
problemReportSchema.statics.getStatsByCategory = async function() {
  return this.aggregate([
    {
      $group: {
        _id: {
          category: '$category',
          status: '$status'
        },
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: '$_id.category',
        statuses: {
          $push: {
            status: '$_id.status',
            count: '$count'
          }
        },
        total: { $sum: '$count' }
      }
    },
    {
      $sort: { total: -1 }
    }
  ]);
};

problemReportSchema.statics.getRecentReports = async function(limit = 10) {
  return this.find()
    .populate('reportedBy', 'username email')
    .populate('reviewedBy', 'username')
    .sort({ createdAt: -1 })
    .limit(limit);
};

module.exports = mongoose.model('ProblemReport', problemReportSchema);
