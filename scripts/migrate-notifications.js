/**
 * Migration Script: Notifications Schema Update
 *
 * Updates notification schema:
 * 1. Renames 'read' field to 'isRead'
 * 2. Adds 'title' field based on notification type
 *
 * Run with: node scripts/migrate-notifications.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/thot';

function getTitleForNotificationType(type) {
  const titleMap = {
    'post_like': 'Nouveau j\'aime',
    'comment_like': 'Nouveau j\'aime',
    'comment_reply': 'Nouvelle réponse',
    'new_follower': 'Nouvel abonné',
    'post_removed': 'Publication supprimée',
    'article_published': 'Nouvel article',
    'mention': 'Nouvelle mention',
    'new_post_from_followed': 'Nouvelle publication'
  };

  return titleMap[type] || 'Notification';
}

async function migrateNotifications() {
  try {
    console.log('🔄 Connecting to database...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to database');

    const db = mongoose.connection.db;
    const notificationsCollection = db.collection('notifications');

    console.log('\n📊 Starting migration of notifications...');

    // Find all notifications
    const notifications = await notificationsCollection.find({}).toArray();
    console.log(`Found ${notifications.length} notifications to migrate`);

    let migratedCount = 0;
    let errorCount = 0;

    for (const notification of notifications) {
      try {
        const updates = {};
        let needsUpdate = false;

        // 1. Rename 'read' to 'isRead' if it exists
        if ('read' in notification && !('isRead' in notification)) {
          updates.isRead = notification.read;
          needsUpdate = true;
        }

        // 2. Add 'title' field if missing
        if (!notification.title) {
          updates.title = getTitleForNotificationType(notification.type);
          needsUpdate = true;
        }

        // Apply updates if needed
        if (needsUpdate) {
          await notificationsCollection.updateOne(
            { _id: notification._id },
            {
              $set: updates,
              $unset: 'read' in notification && 'isRead' in updates ? { read: '' } : {}
            }
          );
          migratedCount++;

          if (migratedCount % 100 === 0) {
            console.log(`✓ Migrated ${migratedCount} notifications...`);
          }
        }
      } catch (error) {
        console.error(`❌ Error migrating notification ${notification._id}:`, error.message);
        errorCount++;
      }
    }

    console.log('\n📈 Migration Summary:');
    console.log(`   Total notifications found: ${notifications.length}`);
    console.log(`   ✅ Successfully migrated: ${migratedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   ⏭️  Skipped (already in correct format): ${notifications.length - migratedCount - errorCount}`);

    console.log('\n✅ Migration completed!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run migration
if (require.main === module) {
  migrateNotifications()
    .then(() => {
      console.log('\n✨ All done!');
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = migrateNotifications;
