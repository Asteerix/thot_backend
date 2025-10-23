const cron = require('node-cron');
const Report = require('../models/report.model');
const Post = require('../models/post.model');
const Comment = require('../models/comment.model');
const Short = require('../models/short.model');
const Notification = require('../models/notification.model');
const mongoose = require('mongoose');

class ReportMonitorService {
  constructor() {
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) {
      console.log('Report monitor service is already running');
      return;
    }

    // Run every 15 minutes
    this.cronJob = cron.schedule('*/15 * * * *', async () => {
      console.log('Running automatic content moderation check...');
      await this.checkAllReports();
    });

    this.isRunning = true;
    console.log('Report monitor service started');
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.isRunning = false;
      console.log('Report monitor service stopped');
    }
  }

  async checkAllReports() {
    try {
      // Get all unique content that has pending reports
      const pendingReports = await Report.aggregate([
        { $match: { status: 'pending' } },
        { $group: {
          _id: { targetType: '$targetType', targetId: '$targetId' },
          count: { $sum: 1 }
        } },
        { $sort: { count: -1 } }
      ]);

      console.log(`Found ${pendingReports.length} items with pending reports`);

      for (const item of pendingReports) {
        await this.checkAndProcessItem(
          item._id.targetType,
          item._id.targetId
        );
      }
    } catch (error) {
      console.error('Error in report monitoring:', error);
    }
  }

  async checkAndProcessItem(targetType, targetId) {
    try {
      const autoRemovalCheck = await Report.checkAutoRemovalThreshold(
        targetType,
        targetId
      );

      if (autoRemovalCheck.shouldRemove) {
        console.log(`Auto-removing ${targetType} ${targetId}: ${autoRemovalCheck.reason}`);

        // Perform the removal
        await this.performAutoRemoval(
          targetType,
          targetId,
          autoRemovalCheck.reason
        );

        // Update all reports for this content
        await Report.updateMany(
          { targetType, targetId },
          {
            status: 'action_taken',
            actionTaken: 'content_removed',
            reviewedAt: new Date(),
            reviewedBy: null // System action
          }
        );

        // Log the action
        console.log(`Successfully removed ${targetType} ${targetId}`, {
          stats: autoRemovalCheck.stats
        });
      }
    } catch (error) {
      console.error(`Error processing ${targetType} ${targetId}:`, error);
    }
  }

  async performAutoRemoval(targetType, targetId, reason) {
    const modelMap = {
      post: Post,
      comment: Comment,
      short: Short
    };

    const model = modelMap[targetType];
    if (!model) {
      throw new Error(`Invalid target type: ${targetType}`);
    }

    // Soft delete the content
    await model.findByIdAndUpdate(targetId, {
      isDeleted: true,
      deletedAt: new Date(),
      deletionReason: `Automatic removal: ${reason}`
    });

    // If it's a post, also handle related content
    if (targetType === 'post') {
      // Remove from user's posts
      const post = await Post.findById(targetId);
      if (post && post.journalist) {
        const User = require('../models/user.model');
        await User.findByIdAndUpdate(
          post.journalist,
          { $pull: { posts: targetId } }
        );

        // Create notification for post owner
        await Notification.createNotification({
          type: 'post_removed',
          senderId: mongoose.Types.ObjectId('000000000000000000000000'), // System ID
          recipientId: post.journalist,
          entityId: targetId,
          entityType: 'post',
          postId: targetId
        });
      }
    }
  }

  // Manual trigger for immediate check
  async checkSpecificContent(targetType, targetId) {
    return await this.checkAndProcessItem(targetType, targetId);
  }
}

module.exports = new ReportMonitorService();
