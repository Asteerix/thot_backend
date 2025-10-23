/**
 * Migration Script: Political Orientation Format
 *
 * Converts political orientation from snake_case to camelCase
 * - extremely_conservative -> extremelyConservative
 * - extremely_progressive -> extremelyProgressive
 *
 * Run with: node scripts/migrate-political-orientation.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/thot';

const conversionMap = {
  'extremely_conservative': 'extremelyConservative',
  'conservative': 'conservative',
  'neutral': 'neutral',
  'progressive': 'progressive',
  'extremely_progressive': 'extremelyProgressive'
};

async function migratePoliticalOrientation() {
  try {
    console.log('🔄 Connecting to database...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to database');

    const db = mongoose.connection.db;
    const postsCollection = db.collection('posts');

    console.log('\n📊 Starting migration of political orientation...');

    // Find all posts with old format
    const posts = await postsCollection.find({
      'politicalOrientation.journalistChoice': { $exists: true }
    }).toArray();

    console.log(`Found ${posts.length} posts to migrate`);

    let migratedCount = 0;
    let errorCount = 0;

    for (const post of posts) {
      try {
        const updates = {};
        let needsUpdate = false;

        // Convert journalistChoice
        const journalistChoice = post.politicalOrientation?.journalistChoice;
        if (journalistChoice && conversionMap[journalistChoice]) {
          updates['politicalOrientation.journalistChoice'] = conversionMap[journalistChoice];
          needsUpdate = true;
        }

        // Convert dominantView
        const dominantView = post.politicalOrientation?.dominantView;
        if (dominantView && conversionMap[dominantView]) {
          updates['politicalOrientation.dominantView'] = conversionMap[dominantView];
          needsUpdate = true;
        }

        // Convert userVotes keys
        const oldVotes = post.politicalOrientation?.userVotes || {};
        const newVotes = {};
        let votesNeedUpdate = false;

        for (const [oldKey, value] of Object.entries(oldVotes)) {
          if (conversionMap[oldKey]) {
            newVotes[conversionMap[oldKey]] = value;
            votesNeedUpdate = true;
          } else {
            newVotes[oldKey] = value;
          }
        }

        if (votesNeedUpdate) {
          updates['politicalOrientation.userVotes'] = newVotes;
          needsUpdate = true;
        }

        // Convert voters array
        const voters = post.politicalOrientation?.voters || [];
        if (voters.length > 0) {
          const updatedVoters = voters.map(voter => {
            if (voter.view && conversionMap[voter.view]) {
              return {
                ...voter,
                view: conversionMap[voter.view]
              };
            }
            return voter;
          });

          const votersChanged = voters.some((voter, index) =>
            voter.view !== updatedVoters[index].view
          );

          if (votersChanged) {
            updates['politicalOrientation.voters'] = updatedVoters;
            needsUpdate = true;
          }
        }

        // Apply updates if needed
        if (needsUpdate) {
          await postsCollection.updateOne(
            { _id: post._id },
            { $set: updates }
          );
          migratedCount++;

          if (migratedCount % 100 === 0) {
            console.log(`✓ Migrated ${migratedCount} posts...`);
          }
        }
      } catch (error) {
        console.error(`❌ Error migrating post ${post._id}:`, error.message);
        errorCount++;
      }
    }

    console.log('\n📈 Migration Summary:');
    console.log(`   Total posts found: ${posts.length}`);
    console.log(`   ✅ Successfully migrated: ${migratedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   ⏭️  Skipped (already in correct format): ${posts.length - migratedCount - errorCount}`);

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
  migratePoliticalOrientation()
    .then(() => {
      console.log('\n✨ All done!');
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = migratePoliticalOrientation;
