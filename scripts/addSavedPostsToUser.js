/* eslint-disable */
const mongoose = require('mongoose');
const User = require('../src/models/user.model');
const Post = require('../src/models/post.model');
require('dotenv').config();

async function addSavedPosts() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find the savedcontenttest user
    const _user = await User.findOne({ username: 'savedcontenttest' });
    if (!user) {
      console.log('❌ User savedcontenttest not found');
      return;
    }

    console.log('✅ Found user:', {
      id: user._id,
      username: user.username,
      email: user.email
    });

    // Initialize interactions if not exists
    if (!user.interactions) {
      user.interactions = {
        savedPosts: [],
        followedJournalists: [],
        readHistory: [],
        politicalViews: new Map()
      };
    }

    if (!user.interactions.savedPosts) {
      user.interactions.savedPosts = [];
    }

    console.log('Current saved posts:', user.interactions.savedPosts.length);

    // Find some posts to save
    const posts = await Post.find({ status: 'published' })
      .sort({ createdAt: -1 })
      .limit(5);

    console.log(`\nFound ${posts.length} published posts`);

    // Add posts to saved list if not already saved
    let addedCount = 0;
    for (const post of posts) {
      if (!user.interactions.savedPosts.includes(post._id)) {
        user.interactions.savedPosts.push(post._id);
        
        // Also update the post's bookmark count
        if (!post.interactions) {
          post.interactions = {};
        }
        if (!post.interactions.bookmarks) {
          post.interactions.bookmarks = { count: 0, users: [] };
        }
        
        const bookmarkUser = {
          user: user._id,
          bookmarkedAt: new Date()
        };
        
        if (!post.interactions.bookmarks.users.find(u => u.user.toString() === user._id.toString())) {
          post.interactions.bookmarks.users.push(bookmarkUser);
          post.interactions.bookmarks.count = post.interactions.bookmarks.users.length;
          await post.save();
        }
        
        addedCount++;
        console.log(`✅ Added post: ${post.title} (${post._id})`);
      }
    }

    await user.save();
    console.log(`\n✅ Added ${addedCount} posts to saved list`);
    console.log(`Total saved posts: ${user.interactions.savedPosts.length}`);

    // Verify by fetching the saved posts
    const savedPosts = await Post.find({ 
      _id: { $in: user.interactions.savedPosts } 
    })
      .populate('journalist', 'name username avatarUrl')
      .limit(10);

    console.log('\n=== SAVED POSTS ===');
    savedPosts.forEach(post => {
      console.log(`- ${post.title} (${post.type})`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

addSavedPosts();
