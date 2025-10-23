/**
 * Database Optimization Script
 * Checks and fixes common database issues
 * Usage: node scripts/optimizeDatabase.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Post = require('../src/models/post.model');
const Short = require('../src/models/short.model');
const User = require('../src/models/user.model');
const Journalist = require('../src/models/journalist.model');
const Comment = require('../src/models/comment.model');
const Notification = require('../src/models/notification.model');

const optimizeDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🔌 Connected to MongoDB');

    console.log('\n🔍 Starting database optimization...\n');

    // 1. Remove orphaned comments
    console.log('📝 Checking for orphaned comments...');
    const orphanedComments = await Comment.find({
      $or: [
        { postId: { $exists: false } },
        { author: { $exists: false } }
      ]
    });

    if (orphanedComments.length > 0) {
      console.log(`Found ${orphanedComments.length} orphaned comments. Removing...`);
      await Comment.deleteMany({
        $or: [
          { postId: { $exists: false } },
          { author: { $exists: false } }
        ]
      });
    } else {
      console.log('✅ No orphaned comments found');
    }

    // 2. Fix missing stats fields
    console.log('\n📊 Fixing missing stats fields...');

    // Fix posts with missing stats
    const postsWithoutStats = await Post.find({
      $or: [
        { 'stats.views': { $exists: false } },
        { 'stats.engagement': { $exists: false } }
      ]
    });

    if (postsWithoutStats.length > 0) {
      console.log(`Found ${postsWithoutStats.length} posts with missing stats. Fixing...`);

      for (const post of postsWithoutStats) {
        post.stats = {
          views: post.stats?.views || 0,
          // Shares functionality has been removed
          engagement: post.stats?.engagement || 0,
          readTime: post.stats?.readTime || 5
        };
        await post.save();
      }
    } else {
      console.log('✅ All posts have proper stats');
    }

    // 3. Clean up duplicate interactions
    console.log('\n🧹 Cleaning duplicate interactions...');

    const posts = await Post.find({});
    let duplicatesFixed = 0;

    for (const post of posts) {
      // Remove duplicate likes
      if (post.interactions?.likes?.users) {
        const uniqueLikes = [];
        const seenUsers = new Set();

        for (const like of post.interactions.likes.users) {
          const userId = like.user?.toString();
          if (userId && !seenUsers.has(userId)) {
            uniqueLikes.push(like);
            seenUsers.add(userId);
          }
        }

        if (uniqueLikes.length !== post.interactions.likes.users.length) {
          post.interactions.likes.users = uniqueLikes;
          post.interactions.likes.count = uniqueLikes.length;
          await post.save();
          duplicatesFixed++;
        }
      }
    }

    if (duplicatesFixed > 0) {
      console.log(`✅ Fixed ${duplicatesFixed} posts with duplicate interactions`);
    } else {
      console.log('✅ No duplicate interactions found');
    }

    // 4. Migrate legacy journalist data
    console.log('\n👥 Checking for legacy journalist accounts...');

    const legacyJournalists = await Journalist.find({});
    let migratedCount = 0;

    for (const journalist of legacyJournalists) {
      // Check if user already exists
      const existingUser = await User.findOne({ email: journalist.email });

      if (!existingUser) {
        // Create user from journalist
        const userData = {
          email: journalist.email,
          password: journalist.password,
          username: journalist.username || journalist.name.toLowerCase().replace(/\s+/g, '_'),
          name: journalist.name,
          role: 'journalist',
          verified: journalist.verified,
          avatarUrl: journalist.avatarUrl,
          bio: journalist.bio,
          organization: journalist.organization,
          specialties: journalist.specialties,
          pressCard: journalist.pressCard,
          stats: journalist.stats,
          status: journalist.status || 'active'
        };

        const newUser = new User(userData);
        await newUser.save();

        // Update all posts to reference the new user
        await Post.updateMany(
          { journalist: journalist._id },
          { journalist: newUser._id }
        );

        migratedCount++;
      }
    }

    if (migratedCount > 0) {
      console.log(`✅ Migrated ${migratedCount} journalist accounts to User model`);
    } else {
      console.log('✅ No legacy journalist accounts to migrate');
    }

    // 5. Clean old notifications
    console.log('\n🔔 Cleaning old notifications...');

    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const deletedNotifications = await Notification.deleteMany({
      createdAt: { $lt: threeMonthsAgo },
      read: true
    });

    console.log(`✅ Deleted ${deletedNotifications.deletedCount} old read notifications`);

    // 6. Update engagement scores
    console.log('\n📈 Updating engagement scores...');

    const recentPosts = await Post.find({
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });

    for (const post of recentPosts) {
      const engagement = calculateEngagement(post);
      if (post.stats.engagement !== engagement) {
        post.stats.engagement = engagement;
        await post.save();
      }
    }

    console.log(`✅ Updated engagement scores for ${recentPosts.length} recent posts`);

    // 7. Fix missing required fields
    console.log('\n🔧 Fixing missing required fields...');

    // Fix posts without status
    await Post.updateMany(
      { status: { $exists: false } },
      { $set: { status: 'published' } }
    );

    // Fix shorts without required fields
    await Short.updateMany(
      { category: { $exists: false } },
      { $set: { category: 'general' } }
    );

    console.log('✅ Fixed missing required fields');

    // 8. Create missing indexes (if not already created)
    console.log('\n🗂️ Ensuring indexes are created...');
    await createCriticalIndexes();
    console.log('✅ Indexes verified');

    console.log('\n✅ Database optimization completed successfully!');

  } catch (error) {
    console.error('❌ Error during optimization:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
};

function calculateEngagement(post) {
  const views = post.stats?.views || 0;
  const likes = post.interactions?.likes?.count || 0;
  const comments = post.interactions?.comments?.count || 0;
  // Shares functionality has been removed

  // Weighted engagement score
  return (views * 0.1) + (likes * 2) + (comments * 3);
}

async function createCriticalIndexes() {
  const db = mongoose.connection.db;

  // Only create the most critical indexes
  const criticalIndexes = [
    { collection: 'posts', index: { isDeleted: 1, createdAt: -1 } },
    { collection: 'posts', index: { journalist: 1, status: 1, createdAt: -1 } },
    { collection: 'shorts', index: { isDeleted: 1, createdAt: -1 } },
    { collection: 'users', index: { email: 1 }, options: { unique: true } },
    { collection: 'notifications', index: { recipient: 1, createdAt: -1 } },
    { collection: 'comments', index: { postId: 1, createdAt: -1 } }
  ];

  for (const { collection, index, options } of criticalIndexes) {
    try {
      await db.collection(collection).createIndex(index, options || {});
    } catch (error) {
      if (error.code !== 11000) { // Ignore duplicate key errors
        console.error(`Failed to create index on ${collection}:`, error.message);
      }
    }
  }
}

// Run the optimization
optimizeDatabase();
