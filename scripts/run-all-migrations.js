/**
 * Master Migration Runner
 *
 * Runs all database migrations to align backend with mobile expectations
 *
 * Run with: node scripts/run-all-migrations.js
 */

const migratePoliticalOrientation = require('./migrate-political-orientation');
const migrateNotifications = require('./migrate-notifications');

async function runAllMigrations() {
  console.log('🚀 Starting all migrations...\n');
  console.log('='.repeat(60));

  try {
    // Migration 1: Political Orientation
    console.log('\n📝 Migration 1/2: Political Orientation Format');
    console.log('='.repeat(60));
    await migratePoliticalOrientation();

    // Migration 2: Notifications
    console.log('\n📝 Migration 2/2: Notifications Schema');
    console.log('='.repeat(60));
    await migrateNotifications();

    console.log('\n' + '='.repeat(60));
    console.log('✨ All migrations completed successfully!');
    console.log('='.repeat(60));

    console.log('\n📋 Next Steps:');
    console.log('   1. Restart your backend server');
    console.log('   2. Test critical endpoints');
    console.log('   3. Verify mobile app compatibility');
    console.log('   4. Monitor logs for any issues\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.error('\n⚠️  Some migrations may have completed. Check the logs above.');
    process.exit(1);
  }
}

// Run all migrations
if (require.main === module) {
  runAllMigrations()
    .then(() => {
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = runAllMigrations;
