const mongoose = require('mongoose');
const Post = require('../src/models/post.model');

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/thot', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function syncInteractionCounts() {
  try {
    console.log('🔄 Starting synchronization of interaction counts...\n');

    const posts = await Post.find({});
    console.log(`Found ${posts.length} posts to check\n`);

    let updated = 0;
    let skipped = 0;

    for (const post of posts) {
      let needsUpdate = false;
      const updates = {};

      // Check likes
      if (post.interactions?.likes) {
        const actualCount = post.interactions.likes.users?.length || 0;
        const storedCount = post.interactions.likes.count || 0;

        if (actualCount !== storedCount) {
          console.log(`📝 Post "${post.title}" (${post._id}):`);
          console.log(`   Likes: count=${storedCount}, actual=${actualCount}`);
          updates['interactions.likes.count'] = actualCount;
          needsUpdate = true;
        }
      }

      // Check comments
      if (post.interactions?.comments) {
        const actualCount = post.interactions.comments.users?.length || 0;
        const storedCount = post.interactions.comments.count || 0;

        if (actualCount !== storedCount) {
          if (!needsUpdate) {
            console.log(`📝 Post "${post.title}" (${post._id}):`);
          }
          console.log(`   Comments: count=${storedCount}, actual=${actualCount}`);
          updates['interactions.comments.count'] = actualCount;
          needsUpdate = true;
        }
      }

      // Shares functionality has been removed

      // Check bookmarks
      if (post.interactions?.bookmarks) {
        const actualCount = post.interactions.bookmarks.users?.length || 0;
        const storedCount = post.interactions.bookmarks.count || 0;

        if (actualCount !== storedCount) {
          if (!needsUpdate) {
            console.log(`📝 Post "${post.title}" (${post._id}):`);
          }
          console.log(`   Bookmarks: count=${storedCount}, actual=${actualCount}`);
          updates['interactions.bookmarks.count'] = actualCount;
          needsUpdate = true;
        }
      }

      // Update if needed
      if (needsUpdate) {
        await Post.updateOne({ _id: post._id }, { $set: updates });
        console.log('   ✅ Updated\n');
        updated++;
      } else {
        skipped++;
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   - Total posts: ${posts.length}`);
    console.log(`   - Updated: ${updated}`);
    console.log(`   - Already synchronized: ${skipped}`);
    console.log('\n✅ Synchronization complete!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

syncInteractionCounts();
