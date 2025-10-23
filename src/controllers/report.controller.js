const Report = require('../models/report.model');
const ProblemReport = require('../models/problemReport.model');
const Post = require('../models/post.model');
const Comment = require('../models/comment.model');
const Short = require('../models/short.model');
const User = require('../models/user.model');

exports.createReport = async (req, res) => {
  try {
    const { targetType, targetId, reason, description } = req.body;
    const reportedBy = req.user.id;

    const validTargetTypes = ['post', 'comment', 'short', 'user'];
    if (!validTargetTypes.includes(targetType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid target type'
      });
    }

    const modelMap = {
      post: Post,
      comment: Comment,
      short: Short,
      user: User
    };

    const targetModel = modelMap[targetType];
    const target = await targetModel.findById(targetId);

    if (!target) {
      return res.status(404).json({
        success: false,
        message: `${targetType} not found`
      });
    }

    const existingReport = await Report.findOne({ reportedBy, targetId });
    if (existingReport) {
      return res.status(400).json({
        success: false,
        message: 'You have already reported this content'
      });
    }

    const report = new Report({
      reportedBy,
      targetType,
      targetId,
      targetModel: targetType.charAt(0).toUpperCase() + targetType.slice(1),
      reason,
      description
    });

    await report.save();

    const autoRemovalCheck = await Report.checkAutoRemovalThreshold(targetType, targetId);

    if (autoRemovalCheck.shouldRemove) {
      await performAutoRemoval(targetType, targetId, autoRemovalCheck.reason);

      await Report.updateMany(
        { targetType, targetId },
        {
          status: 'action_taken',
          actionTaken: 'content_removed',
          reviewedAt: new Date()
        }
      );
    }

    res.status(201).json({
      success: true,
      message: 'Report submitted successfully',
      report,
      autoRemovalCheck
    });
  } catch (error) {
    console.error('Error creating report:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting report'
    });
  }
};

async function performAutoRemoval(targetType, targetId, reason) {
  try {
    const modelMap = {
      post: Post,
      comment: Comment,
      short: Short,
      user: User
    };

    const model = modelMap[targetType];

    if (targetType === 'user') {
      await model.findByIdAndUpdate(targetId, {
        isActive: false,
        suspendedAt: new Date(),
        suspensionReason: reason
      });
    } else {
      await model.findByIdAndUpdate(targetId, {
        isDeleted: true,
        deletedAt: new Date(),
        deletionReason: reason
      });
    }
  } catch (error) {
    console.error('Error performing auto removal:', error);
  }
}

exports.getReports = async (req, res) => {
  try {
    const {
      status = 'pending',
      targetType,
      page = 1,
      limit = 20
    } = req.query;

    const query = {};
    if (status) {
      query.status = status;
    }
    if (targetType) {
      query.targetType = targetType;
    }

    const reports = await Report.find(query)
      .populate('reportedBy', 'username email')
      .populate('reviewedBy', 'username')
      .sort('-createdAt')
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Report.countDocuments(query);

    res.json({
      success: true,
      reports,
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching reports'
    });
  }
};

exports.getMyReports = async (req, res) => {
  try {
    const reports = await Report.find({ reportedBy: req.user.id })
      .sort('-createdAt');

    res.json({
      success: true,
      reports
    });
  } catch (error) {
    console.error('Error fetching user reports:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching your reports'
    });
  }
};

exports.reviewReport = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { status, actionTaken } = req.body;

    if (!req.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const report = await Report.findByIdAndUpdate(
      reportId,
      {
        status,
        actionTaken,
        reviewedBy: req.user.id,
        reviewedAt: new Date()
      },
      { new: true }
    );

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    res.json({
      success: true,
      message: 'Report reviewed successfully',
      report
    });
  } catch (error) {
    console.error('Error reviewing report:', error);
    res.status(500).json({
      success: false,
      message: 'Error reviewing report'
    });
  }
};

exports.getReportStats = async (req, res) => {
  try {
    const { targetType, targetId } = req.params;

    if (!targetType || !targetId) {
      return res.status(400).json({
        success: false,
        message: 'Target type and ID are required'
      });
    }

    const stats = await Report.getReportStats(targetType, targetId);
    const autoRemovalCheck = await Report.checkAutoRemovalThreshold(targetType, targetId);

    res.json({
      success: true,
      stats,
      autoRemovalCheck
    });
  } catch (error) {
    console.error('Error fetching report stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching report statistics'
    });
  }
};

// Create a problem report (bug report / issue)
exports.createProblemReport = async (req, res) => {
  try {
    const { category, subCategory, message, platform, appVersion } = req.body;
    const userId = req.user._id || req.user.id;

    if (!category || !subCategory || !message) {
      return res.status(400).json({
        success: false,
        message: 'Category, subcategory and message are required'
      });
    }

    // Create a problem report using the dedicated model
    const problemReport = new ProblemReport({
      reportedBy: userId,
      category,
      subCategory,
      message,
      platform: platform || 'unknown',
      appVersion: appVersion || 'unknown',
      userAgent: req.headers['user-agent'],
      status: 'pending'
    });

    await problemReport.save();

    res.status(201).json({
      success: true,
      message: 'Problem report submitted successfully',
      reportId: problemReport._id
    });
  } catch (error) {
    console.error('Error creating problem report:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting problem report'
    });
  }
};

// Get problem reports (admin only)
exports.getProblemReports = async (req, res) => {
  try {
    // Check if user is admin
    if (!req.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const { page = 1, limit = 20, status, category } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = {};

    if (status) {
      query.status = status;
    }
    if (category) {
      query.category = category;
    }

    const [reports, total] = await Promise.all([
      ProblemReport.find(query)
        .populate('reportedBy', 'username email')
        .populate('reviewedBy', 'username')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      ProblemReport.countDocuments(query)
    ]);

    res.json({
      success: true,
      reports,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching problem reports:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching problem reports'
    });
  }
};

// Update problem report status (admin only)
exports.updateProblemReport = async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const { id } = req.params;
    const { status, priority, resolution } = req.body;

    const problemReport = await ProblemReport.findById(id);

    if (!problemReport) {
      return res.status(404).json({
        success: false,
        message: 'Problem report not found'
      });
    }

    // Update fields
    if (status) {
      problemReport.status = status;
    }
    if (priority) {
      problemReport.priority = priority;
    }
    if (resolution) {
      problemReport.resolution = resolution;
    }

    // If status is being changed to a reviewed state, set review info
    if (status && ['resolved', 'dismissed', 'in_progress'].includes(status)) {
      problemReport.reviewedBy = req.user.id;
      problemReport.reviewedAt = new Date();
    }

    await problemReport.save();

    const updatedReport = await ProblemReport.findById(id)
      .populate('reportedBy', 'username email')
      .populate('reviewedBy', 'username');

    res.json({
      success: true,
      message: 'Problem report updated successfully',
      report: updatedReport
    });
  } catch (error) {
    console.error('Error updating problem report:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating problem report'
    });
  }
};

// Get problem report statistics (admin only)
exports.getProblemReportStats = async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const [statsByCategory, recentReports, totalByStatus] = await Promise.all([
      ProblemReport.getStatsByCategory(),
      ProblemReport.getRecentReports(5),
      ProblemReport.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    const totalReports = await ProblemReport.countDocuments();

    res.json({
      success: true,
      stats: {
        total: totalReports,
        byCategory: statsByCategory,
        byStatus: totalByStatus,
        recentReports
      }
    });
  } catch (error) {
    console.error('Error fetching problem report stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching problem report statistics'
    });
  }
};
