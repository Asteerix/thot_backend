/**
 * Migration Script: User.interactions.savedPosts to User.interactions.bookmarks
 *
 * Migrates all users' savedPosts to bookmarks field
 * This completes the migration from the deprecated savedPosts to the new bookmarks structure
 */

const mongoose = require('mongoose');
const User = require('../../src/models/user.model');

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/thot';

async function migrateSavedPostsToBookmarks() {
  try {
    console.log('🚀 Starting User savedPosts to bookmarks migration...\n');

    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all users with savedPosts
    const usersWithSavedPosts = await User.find({
      'interactions.savedPosts': { $exists: true, $ne: [] }
    });

    console.log(`📊 Found ${usersWithSavedPosts.length} users with savedPosts\n`);

    if (usersWithSavedPosts.length === 0) {
      console.log('✅ No users to migrate. Exiting...');
      await mongoose.disconnect();
      return;
    }

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (const user of usersWithSavedPosts) {
      try {
        console.log(`👤 Migrating user: ${user._id} - ${user.username || user.email}`);

        // Initialize interactions if needed
        if (!user.interactions) {
          user.interactions = {};
        }

        // Initialize bookmarks array if not exists
        if (!user.interactions.bookmarks) {
          user.interactions.bookmarks = [];
        }

        // Get unique saved posts
        const savedPosts = user.interactions.savedPosts || [];
        const existingBookmarks = user.interactions.bookmarks || [];

        // Merge without duplicates
        const existingBookmarkIds = new Set(
          existingBookmarks.map(id => id.toString())
        );

        const newBookmarks = savedPosts.filter(
          postId => !existingBookmarkIds.has(postId.toString())
        );

        if (newBookmarks.length > 0) {
          user.interactions.bookmarks = [
            ...existingBookmarks,
            ...newBookmarks
          ];
          console.log(`  ✅ Added ${newBookmarks.length} new bookmarks`);
        } else {
          console.log(`  ⏭️  All savedPosts already in bookmarks`);
        }

        // Clear savedPosts
        user.interactions.savedPosts = [];

        await user.save();
        console.log(`  ✅ Migration completed for user ${user._id}\n`);
        successCount++;

      } catch (error) {
        console.error(`❌ Error migrating user ${user._id}:`, error.message);
        errorCount++;
        errors.push({
          userId: user._id,
          username: user.username || user.email,
          error: error.message
        });
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Successfully migrated: ${successCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📝 Total processed: ${usersWithSavedPosts.length}`);

    if (errors.length > 0) {
      console.log('\n❌ ERRORS:');
      errors.forEach(err => {
        console.log(`  - ${err.userId}: ${err.username}`);
        console.log(`    Error: ${err.error}\n`);
      });
    }

    // Final verification
    console.log('\n🔍 Running final verification...');
    const remainingSavedPosts = await User.countDocuments({
      'interactions.savedPosts': { $exists: true, $ne: [] }
    });

    if (remainingSavedPosts === 0) {
      console.log('✨ ✨ ✨ Migration completed successfully! ✨ ✨ ✨');
      console.log('All savedPosts have been migrated to bookmarks\n');
    } else {
      console.log(`⚠️  Warning: ${remainingSavedPosts} users still have savedPosts`);
      console.log('You may need to run the migration again.\n');
    }

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');

  } catch (error) {
    console.error('❌ Fatal error during migration:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run migration
if (require.main === module) {
  migrateSavedPostsToBookmarks();
}

module.exports = migrateSavedPostsToBookmarks;
