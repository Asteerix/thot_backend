const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Post = require('../src/models/post.model');
const User = require('../src/models/user.model');

async function fixEngagementStats() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // First, let's analyze the actual structure of posts
    console.log('\n1. ANALYZING POST STRUCTURE:');
    console.log('===========================\n');

    const samplePost = await Post.findOne({ 'interactions.likes.users': { $exists: true, $ne: [] } });
    if (samplePost) {
      console.log('Sample post with likes:');
      console.log('- Post ID:', samplePost._id);
      console.log('- Title:', samplePost.title);
      console.log('- Interactions structure:');
      console.log(JSON.stringify(samplePost.interactions, null, 2));
    } else {
      console.log('No posts with likes found');
    }

    // Get all posts and fix the count fields
    console.log('\n2. FIXING INTERACTION COUNTS:');
    console.log('=============================\n');

    const posts = await Post.find({});
    let fixedCount = 0;

    for (const post of posts) {
      let needsUpdate = false;

      // Initialize interactions if missing
      if (!post.interactions) {
        post.interactions = {
          likes: { users: [], count: 0 },
          dislikes: { users: [], count: 0 },
          comments: { users: [], count: 0 },
          reports: { users: [], count: 0 },
          bookmarks: { users: [], count: 0 }
          // Shares functionality has been removed
        };
        needsUpdate = true;
      }

      // Fix likes count
      if (post.interactions.likes) {
        const actualLikesCount = post.interactions.likes.users ? post.interactions.likes.users.length : 0;
        if (post.interactions.likes.count !== actualLikesCount) {
          console.log(`Post ${post._id}: Fixing likes count from ${post.interactions.likes.count} to ${actualLikesCount}`);
          post.interactions.likes.count = actualLikesCount;
          needsUpdate = true;
        }
      }

      // Fix comments count
      if (post.interactions.comments) {
        const actualCommentsCount = post.interactions.comments.users ? post.interactions.comments.users.length : 0;
        if (post.interactions.comments.count !== actualCommentsCount) {
          console.log(`Post ${post._id}: Fixing comments count from ${post.interactions.comments.count} to ${actualCommentsCount}`);
          post.interactions.comments.count = actualCommentsCount;
          needsUpdate = true;
        }
      }

      // Shares functionality has been removed

      // Fix bookmarks count
      if (post.interactions.bookmarks) {
        const actualBookmarksCount = post.interactions.bookmarks.users ? post.interactions.bookmarks.users.length : 0;
        if (post.interactions.bookmarks.count !== actualBookmarksCount) {
          console.log(`Post ${post._id}: Fixing bookmarks count from ${post.interactions.bookmarks.count} to ${actualBookmarksCount}`);
          post.interactions.bookmarks.count = actualBookmarksCount;
          needsUpdate = true;
        }
      }

      // Fix dislikes count
      if (post.interactions.dislikes) {
        const actualDislikesCount = post.interactions.dislikes.users ? post.interactions.dislikes.users.length : 0;
        if (post.interactions.dislikes.count !== actualDislikesCount) {
          console.log(`Post ${post._id}: Fixing dislikes count from ${post.interactions.dislikes.count} to ${actualDislikesCount}`);
          post.interactions.dislikes.count = actualDislikesCount;
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        await post.save();
        fixedCount++;
      }
    }

    console.log(`\nFixed ${fixedCount} posts out of ${posts.length} total posts`);

    // Now let's check the engagement stats for journalists
    console.log('\n3. JOURNALIST ENGAGEMENT STATS:');
    console.log('================================\n');

    const journalists = await User.find({ role: 'journalist' });

    for (const journalist of journalists) {
      console.log(`\nJournalist: ${journalist.username || journalist.name} (ID: ${journalist._id})`);

      const journalistPosts = await Post.find({
        journalist: journalist._id,
        status: 'published'
      });

      let totalLikes = 0;
      let totalComments = 0;
      // Shares functionality has been removed
      let totalViews = 0;

      for (const post of journalistPosts) {
        // Count actual array lengths
        totalLikes += post.interactions?.likes?.users?.length || 0;
        totalComments += post.interactions?.comments?.users?.length || 0;
        // Shares functionality has been removed
        totalViews += post.stats?.views || 0;
      }

      console.log(`- Total posts: ${journalistPosts.length}`);
      console.log(`- Total likes: ${totalLikes}`);
      console.log(`- Total comments: ${totalComments}`);
      // Shares functionality has been removed
      console.log(`- Total views: ${totalViews}`);
      console.log(`- Total engagement: ${totalLikes + totalComments}`);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n\nDisconnected from MongoDB');
  }
}

// Run the fix script
fixEngagementStats();
