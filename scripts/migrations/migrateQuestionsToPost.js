/**
 * Migration Script: Questions to Post Model
 *
 * Migrates all Question documents to Post model with type='question'
 * Preserves all data including votes, likes, comments
 */

const mongoose = require('mongoose');
const Question = require('../../src/models/question.model');
const Post = require('../../src/models/post.model');
const User = require('../../src/models/user.model');

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/thot';

async function migrateQuestions() {
  try {
    console.log('🚀 Starting Question to Post migration...\n');

    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all questions
    const questions = await Question.find({}).populate('author');
    console.log(`📊 Found ${questions.length} questions to migrate\n`);

    if (questions.length === 0) {
      console.log('✅ No questions to migrate. Exiting...');
      await mongoose.disconnect();
      return;
    }

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (const question of questions) {
      try {
        console.log(`📝 Migrating question: ${question._id} - "${question.title}"`);

        // Check if already migrated
        const existing = await Post.findOne({
          legacyId: question._id,
          legacyModel: 'Question'
        });

        if (existing) {
          console.log(`⏭️  Already migrated, skipping...`);
          successCount++;
          continue;
        }

        // Calculate total votes
        const totalVotes = question.votes.length;

        // Map political view to political orientation structure
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

        // Create new Post document
        const postData = {
          title: question.title,
          content: question.description,
          imageUrl: question.imageUrl,
          type: 'question',
          status: 'published',
          journalist: question.author._id,
          domain: 'Politics', // Default domain, adjust if needed
          politicalOrientation: politicalOrientation,

          // Stats
          stats: {
            views: 0,
            responses: totalVotes,
            shares: 0,
            readTime: 0,
            completion: 0,
            engagement: 0
          },

          // Interactions - migrate likes/dislikes/comments
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
            reports: {
              users: [],
              count: 0
            },
            bookmarks: {
              users: [],
              count: 0
            }
          },

          // Question-specific metadata
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

          // Preserve original timestamps
          createdAt: question.createdAt,
          updatedAt: question.createdAt,

          // Track migration
          legacyId: question._id,
          legacyModel: 'Question'
        };

        const newPost = new Post(postData);
        await newPost.save();

        console.log(`✅ Migrated successfully to Post ID: ${newPost._id}\n`);
        successCount++;

      } catch (error) {
        console.error(`❌ Error migrating question ${question._id}:`, error.message);
        errorCount++;
        errors.push({
          questionId: question._id,
          title: question.title,
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
    console.log(`📝 Total processed: ${questions.length}`);

    if (errors.length > 0) {
      console.log('\n❌ ERRORS:');
      errors.forEach(err => {
        console.log(`  - ${err.questionId}: ${err.title}`);
        console.log(`    Error: ${err.error}\n`);
      });
    }

    console.log('\n✅ Migration completed!');
    console.log('⚠️  Review the migrated data before deleting Question collection');

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
  migrateQuestions();
}

module.exports = migrateQuestions;
