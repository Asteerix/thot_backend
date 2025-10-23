/**
 * Run All Migrations Script
 *
 * Executes all migration scripts in the correct order
 * to transition from legacy Question/Short models to unified Post model
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Import migration scripts
const migrateQuestions = require('./migrateQuestionsToPost');
const migrateShorts = require('./migrateShortsToPost');
const migrateSavedPosts = require('./migrateSavedPostsToBookmarks');
const migrateSavedBy = require('../migrateSavedByToBookmarks');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/thot';

async function runAllMigrations() {
  console.log('🚀 Starting Full Migration Process...\n');
  console.log('='.repeat(70));
  console.log('This will migrate your database from legacy models to unified Post model');
  console.log('='.repeat(70) + '\n');

  try {
    // Connect once for all migrations
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const Question = require('../../src/models/question.model');
    const Short = require('../../src/models/short.model');
    const Post = require('../../src/models/post.model');
    const User = require('../../src/models/user.model');

    // Step 1: Migrate Questions to Post
    console.log('\n' + '='.repeat(70));
    console.log('STEP 1: Migrating Questions to Post Model');
    console.log('='.repeat(70));

    const questions = await Question.find({}).populate('author');
    console.log(`📊 Found ${questions.length} questions to migrate\n`);

    let successCount = 0;
    for (const question of questions) {
      try {
        const existing = await Post.findOne({
          legacyId: question._id,
          legacyModel: 'Question'
        });

        if (existing) {
          console.log(`⏭️  Question ${question._id} already migrated, skipping...`);
          successCount++;
          continue;
        }

        const totalVotes = question.votes.length;
        const politicalOrientation = {
          journalistChoice: question.politicalView,
          userVotes: {
            extremelyConservative: 0,
            conservative: 0,
            neutral: 0,
            progressive: 0,
            extremelyProgressive: 0
          },
          finalScore: 0,
          dominantView: question.politicalView,
          voters: []
        };

        const postData = {
          title: question.title,
          content: question.description,
          imageUrl: question.imageUrl,
          type: 'question',
          status: 'published',
          journalist: question.author._id,
          domain: 'Politics',
          politicalOrientation: politicalOrientation,
          stats: {
            views: 0,
            responses: totalVotes,
            shares: 0,
            readTime: 0,
            completion: 0,
            engagement: 0
          },
          interactions: {
            likes: {
              users: question.likes.map(userId => ({
                user: userId,
                createdAt: question.createdAt
              })),
              count: question.likes.length
            },
            dislikes: {
              users: question.dislikes.map(userId => ({
                user: userId,
                createdAt: question.createdAt
              })),
              count: question.dislikes.length
            },
            comments: {
              users: question.comments.map(commentId => ({
                comment: commentId,
                createdAt: question.createdAt
              })),
              count: question.comments.length
            },
            reports: { users: [], count: 0 },
            bookmarks: { users: [], count: 0 }
          },
          metadata: {
            question: {
              options: question.options.map(opt => ({
                text: opt.text,
                votes: opt.votes || 0
              })),
              totalVotes: totalVotes,
              isMultipleChoice: false,
              allowComments: true,
              voters: question.votes.map(vote => ({
                userId: vote.user,
                optionIds: [vote.option],
                votedAt: question.createdAt
              }))
            }
          },
          createdAt: question.createdAt,
          updatedAt: question.createdAt,
          legacyId: question._id,
          legacyModel: 'Question'
        };

        const newPost = new Post(postData);
        await newPost.save();
        console.log(`✅ Migrated question ${question._id} to Post ${newPost._id}`);
        successCount++;
      } catch (error) {
        console.error(`❌ Error migrating question ${question._id}:`, error.message);
      }
    }
    console.log(`✅ Question migration completed: ${successCount}/${questions.length}\n`);

    // Step 2: Migrate Shorts to Post
    console.log('\n' + '='.repeat(70));
    console.log('STEP 2: Migrating Shorts to Post Model');
    console.log('='.repeat(70));

    const shorts = await Short.find({}).populate('author');
    console.log(`📊 Found ${shorts.length} shorts to migrate\n`);

    successCount = 0;
    for (const short of shorts) {
      try {
        const existing = await Post.findOne({
          legacyId: short._id,
          legacyModel: 'Short'
        });

        if (existing) {
          console.log(`⏭️  Short ${short._id} already migrated, skipping...`);
          successCount++;
          continue;
        }

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
          tags: short.hashtags || [],
          stats: {
            views: short.views || 0,
            responses: 0,
            shares: 0,
            readTime: 0,
            completion: 0,
            engagement: 0
          },
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
            reports: { users: [], count: 0 },
            bookmarks: { users: [], count: 0 }
          },
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
          createdAt: short.createdAt,
          updatedAt: short.createdAt,
          ...(short.isDeleted && {
            deletedAt: short.deletedAt,
            deletionReason: short.deletionReason
          }),
          legacyId: short._id,
          legacyModel: 'Short'
        };

        const newPost = new Post(postData);
        await newPost.save();
        console.log(`✅ Migrated short ${short._id} to Post ${newPost._id}`);
        successCount++;
      } catch (error) {
        console.error(`❌ Error migrating short ${short._id}:`, error.message);
      }
    }
    console.log(`✅ Short migration completed: ${successCount}/${shorts.length}\n`);

    // Step 3: Migrate Post.savedBy to Post.interactions.bookmarks
    console.log('\n' + '='.repeat(70));
    console.log('STEP 3: Migrating Post.savedBy to interactions.bookmarks');
    console.log('='.repeat(70));
    await migrateSavedBy();
    console.log('✅ Post savedBy migration completed\n');

    // Step 4: Migrate User.savedPosts to User.bookmarks
    console.log('\n' + '='.repeat(70));
    console.log('STEP 4: Migrating User.savedPosts to bookmarks');
    console.log('='.repeat(70));

    const usersWithSavedPosts = await User.find({
      'interactions.savedPosts': { $exists: true, $ne: [] }
    });
    console.log(`📊 Found ${usersWithSavedPosts.length} users with savedPosts\n`);

    successCount = 0;
    for (const user of usersWithSavedPosts) {
      try {
        if (!user.interactions) user.interactions = {};
        if (!user.interactions.bookmarks) user.interactions.bookmarks = [];

        const savedPosts = user.interactions.savedPosts || [];
        const existingBookmarks = user.interactions.bookmarks || [];
        const existingBookmarkIds = new Set(existingBookmarks.map(id => id.toString()));

        const newBookmarks = savedPosts.filter(
          postId => !existingBookmarkIds.has(postId.toString())
        );

        if (newBookmarks.length > 0) {
          user.interactions.bookmarks = [...existingBookmarks, ...newBookmarks];
          console.log(`  ✅ Added ${newBookmarks.length} new bookmarks for user ${user._id}`);
        }

        user.interactions.savedPosts = [];
        await user.save();
        successCount++;
      } catch (error) {
        console.error(`❌ Error migrating user ${user._id}:`, error.message);
      }
    }
    console.log(`✅ User savedPosts migration completed: ${successCount}/${usersWithSavedPosts.length}\n`);

    // Final summary
    console.log('\n' + '='.repeat(70));
    console.log('✨ ALL MIGRATIONS COMPLETED SUCCESSFULLY ✨');
    console.log('='.repeat(70));

    // Verification (Post and User already required above)
    const postCount = await Post.countDocuments();
    const questionCount = await Post.countDocuments({ type: 'question' });
    const shortCount = await Post.countDocuments({ type: 'short' });
    const usersWithBookmarks = await User.countDocuments({
      'interactions.bookmarks': { $exists: true, $ne: [] }
    });

    console.log('\n📊 DATABASE STATE:');
    console.log(`   Total Posts: ${postCount}`);
    console.log(`   Questions (type='question'): ${questionCount}`);
    console.log(`   Shorts (type='short'): ${shortCount}`);
    console.log(`   Users with bookmarks: ${usersWithBookmarks}`);

    console.log('\n✅ NEXT STEPS:');
    console.log('   1. Test all API endpoints (questions, shorts, posts)');
    console.log('   2. Test mobile app thoroughly');
    console.log('   3. If everything works, you can delete:');
    console.log('      - backend/src/models/question.model.js.deprecated');
    console.log('      - backend/src/models/short.model.js.deprecated');
    console.log('      - backend/src/controllers/question.controller.js.deprecated');
    console.log('      - backend/src/controllers/short.controller.js.deprecated');
    console.log('   4. Drop legacy collections in MongoDB:');
    console.log('      - db.questions.drop()');
    console.log('      - db.shorts.drop()');

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
    console.log('\n🎉 Migration process completed successfully!\n');

  } catch (error) {
    console.error('\n❌ FATAL ERROR during migration:', error);
    console.error(error.stack);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run all migrations
if (require.main === module) {
  runAllMigrations()
    .then(() => {
      console.log('✅ All migrations executed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = runAllMigrations;
