/**
 * Migration Script: Fix Opposition ObjectIds
 *
 * Problem: opposingPosts.postId and opposedByPosts.postId are stored as strings
 * Solution: Convert them to ObjectId for proper populate() functionality
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/thot';

async function fixOppositionObjectIds() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const Post = mongoose.model('Post', new mongoose.Schema({}, { strict: false }));

    // Find all posts with opposition data
    const posts = await Post.find({
      $or: [
        { opposingPosts: { $exists: true, $ne: [] } },
        { opposedByPosts: { $exists: true, $ne: [] } }
      ]
    }).lean();

    console.log(`\n📊 Found ${posts.length} posts with opposition data\n`);

    let updatedCount = 0;

    for (const post of posts) {
      const updates = {};
      let needsUpdate = false;

      // Fix opposingPosts
      if (post.opposingPosts && post.opposingPosts.length > 0) {
        const fixedOpposingPosts = post.opposingPosts.map(opp => {
          if (typeof opp.postId === 'string') {
            needsUpdate = true;
            return {
              ...opp,
              postId: new mongoose.Types.ObjectId(opp.postId)
            };
          }
          return opp;
        });
        updates.opposingPosts = fixedOpposingPosts;
      }

      // Fix opposedByPosts
      if (post.opposedByPosts && post.opposedByPosts.length > 0) {
        const fixedOpposedByPosts = post.opposedByPosts.map(opp => {
          if (typeof opp.postId === 'string') {
            needsUpdate = true;
            return {
              ...opp,
              postId: new mongoose.Types.ObjectId(opp.postId)
            };
          }
          return opp;
        });
        updates.opposedByPosts = fixedOpposedByPosts;
      }

      if (needsUpdate) {
        await Post.updateOne({ _id: post._id }, { $set: updates });
        updatedCount++;
        console.log(`✅ Updated post: ${post.title} (${post._id})`);
        if (updates.opposingPosts) {
          console.log(`   - Fixed ${updates.opposingPosts.length} opposingPosts`);
        }
        if (updates.opposedByPosts) {
          console.log(`   - Fixed ${updates.opposedByPosts.length} opposedByPosts`);
        }
      }
    }

    console.log(`\n✅ Migration completed! Updated ${updatedCount} posts`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

fixOppositionObjectIds();
