/**
 * Migration Script: Shorts to Post Model
 *
 * Migrates all Short documents to Post model with type='short'
 * Preserves all data including likes, dislikes, comments, views
 */

const mongoose = require('mongoose');
const Short = require('../../src/models/short.model');
const Post = require('../../src/models/post.model');
const User = require('../../src/models/user.model');

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/thot';

async function migrateShorts() {
  try {
    console.log('🚀 Starting Short to Post migration...\n');

    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all shorts
    const shorts = await Short.find({}).populate('author');
    console.log(`📊 Found ${shorts.length} shorts to migrate\n`);

    if (shorts.length === 0) {
      console.log('✅ No shorts to migrate. Exiting...');
      await mongoose.disconnect();
      return;
    }

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (const short of shorts) {
      try {
        console.log(`📹 Migrating short: ${short._id} - "${short.title}"`);

        // Check if already migrated
        const existing = await Post.findOne({
          legacyId: short._id,
          legacyModel: 'Short'
        });

        if (existing) {
          console.log(`⏭️  Already migrated, skipping...`);
          successCount++;
          continue;
        }

        // Map category to domain
        const domainMapping = {
          'politics': 'Politics',
          'economy': 'Economy',
          'society': 'Society',
          'culture': 'Culture',
          'science': 'Science & Tech',
          'sport': 'Sport',
          'general': 'General'
        };
        const domain = domainMapping[short.category] || 'General';

        // Map political view to political orientation structure
        const politicalOrientation = {
          journalistChoice: short.politicalView,
          userVotes: {
            extremelyConservative: 0,
            conservative: 0,
            neutral: 0,
            progressive: 0,
            extremelyProgressive: 0
          },
          finalScore: 0,
          dominantView: short.politicalView,
          voters: []
        };

        // Create new Post document
        const postData = {
          title: short.title,
          content: short.description,
          videoUrl: short.videoUrl,
          thumbnailUrl: short.thumbnailUrl,
          imageUrl: short.imageUrl,
          type: 'short',
          status: short.isDeleted ? 'removed' : 'published',
          journalist: short.author._id,
          domain: domain,
          politicalOrientation: politicalOrientation,

          // Tags (migrate hashtags)
          tags: short.hashtags || [],

          // Stats
          stats: {
            views: short.views || 0,
            responses: 0,
            shares: 0,
            readTime: 0,
            completion: 0,
            engagement: 0
          },

          // Interactions - migrate likes/dislikes/comments
          interactions: {
            likes: {
              users: short.likes.map(userId => ({
                user: userId,
                createdAt: short.createdAt
              })),
              count: short.likes.length
            },
            dislikes: {
              users: short.dislikes.map(userId => ({
                user: userId,
                createdAt: short.createdAt
              })),
              count: short.dislikes.length
            },
            comments: {
              users: short.comments.map(commentId => ({
                comment: commentId,
                createdAt: short.createdAt
              })),
              count: short.comments.length
            },
            reports: {
              users: [],
              count: 0
            },
            bookmarks: {
              users: [],
              count: 0
            }
          },

          // Short-specific metadata
          metadata: {
            video: {
              duration: short.duration,
              quality: 'auto',
              transcript: '',
              hash: '',
              size: 0,
              width: 0,
              height: 0,
              format: 'mp4',
              bitrate: 0,
              fps: 30,
              codec: 'h264',
              subtitles: []
            }
          },

          // Preserve original timestamps
          createdAt: short.createdAt,
          updatedAt: short.createdAt,

          // Track deletion if applicable
          ...(short.isDeleted && {
            deletedAt: short.deletedAt,
            deletionReason: short.deletionReason
          }),

          // Track migration
          legacyId: short._id,
          legacyModel: 'Short'
        };

        const newPost = new Post(postData);
        await newPost.save();

        console.log(`✅ Migrated successfully to Post ID: ${newPost._id}\n`);
        successCount++;

      } catch (error) {
        console.error(`❌ Error migrating short ${short._id}:`, error.message);
        errorCount++;
        errors.push({
          shortId: short._id,
          title: short.title,
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
    console.log(`📝 Total processed: ${shorts.length}`);

    if (errors.length > 0) {
      console.log('\n❌ ERRORS:');
      errors.forEach(err => {
        console.log(`  - ${err.shortId}: ${err.title}`);
        console.log(`    Error: ${err.error}\n`);
      });
    }

    console.log('\n✅ Migration completed!');
    console.log('⚠️  Review the migrated data before deleting Short collection');

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
  migrateShorts();
}

module.exports = migrateShorts;
