const mongoose = require('mongoose');
const Post = require('../src/models/post.model');
const User = require('../src/models/user.model');
const Short = require('../src/models/short.model');
require('dotenv').config();

// Migration script to convert absolute URLs to relative paths
async function migrateToRelativeUrls() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('Connected to MongoDB');
    console.log('Starting URL migration...');

    // Function to extract relative path from absolute URL
    const extractRelativePath = (url) => {
      if (!url) {
        return null;
      }

      // Already a relative path
      if (url.startsWith('/')) {
        return url;
      }

      // Try to extract path after domain
      try {
        // eslint-disable-next-line no-undef
        const urlObj = new URL(url);
        return urlObj.pathname;
      } catch {
        // If URL parsing fails, try to extract manually
        const matches = url.match(/https?:\/\/[^/]+(\/.*)/);
        if (matches && matches[1]) {
          return matches[1];
        }
        // Return as is if can't extract
        return url;
      }
    };

    // Migrate Posts
    console.log('\nMigrating Post URLs...');
    const posts = await Post.find({
      $or: [
        { imageUrl: { $regex: /^https?:\/\// } },
        { videoUrl: { $regex: /^https?:\/\// } },
        { thumbnailUrl: { $regex: /^https?:\/\// } }
      ]
    });

    console.log(`Found ${posts.length} posts with absolute URLs`);

    for (const post of posts) {
      const updates = {};

      if (post.imageUrl && post.imageUrl.match(/^https?:\/\//)) {
        updates.imageUrl = extractRelativePath(post.imageUrl);
        console.log(`Post ${post._id}: imageUrl ${post.imageUrl} -> ${updates.imageUrl}`);
      }

      if (post.videoUrl && post.videoUrl.match(/^https?:\/\//)) {
        updates.videoUrl = extractRelativePath(post.videoUrl);
        console.log(`Post ${post._id}: videoUrl ${post.videoUrl} -> ${updates.videoUrl}`);
      }

      if (post.thumbnailUrl && post.thumbnailUrl.match(/^https?:\/\//)) {
        updates.thumbnailUrl = extractRelativePath(post.thumbnailUrl);
        console.log(`Post ${post._id}: thumbnailUrl ${post.thumbnailUrl} -> ${updates.thumbnailUrl}`);
      }

      if (Object.keys(updates).length > 0) {
        await Post.updateOne({ _id: post._id }, { $set: updates });
      }
    }

    // Migrate Users
    console.log('\nMigrating User URLs...');
    const users = await User.find({
      $or: [
        { avatarUrl: { $regex: /^https?:\/\// } },
        { coverUrl: { $regex: /^https?:\/\// } }
      ]
    });

    console.log(`Found ${users.length} users with absolute URLs`);

    for (const user of users) {
      const updates = {};

      if (user.avatarUrl && user.avatarUrl.match(/^https?:\/\//)) {
        updates.avatarUrl = extractRelativePath(user.avatarUrl);
        console.log(`User ${user._id}: avatarUrl ${user.avatarUrl} -> ${updates.avatarUrl}`);
      }

      if (user.coverUrl && user.coverUrl.match(/^https?:\/\//)) {
        updates.coverUrl = extractRelativePath(user.coverUrl);
        console.log(`User ${user._id}: coverUrl ${user.coverUrl} -> ${updates.coverUrl}`);
      }

      if (Object.keys(updates).length > 0) {
        await User.updateOne({ _id: user._id }, { $set: updates });
      }
    }

    // Migrate Shorts
    console.log('\nMigrating Short URLs...');
    const shorts = await Short.find({
      $or: [
        { videoUrl: { $regex: /^https?:\/\// } },
        { thumbnailUrl: { $regex: /^https?:\/\// } }
      ]
    });

    console.log(`Found ${shorts.length} shorts with absolute URLs`);

    for (const short of shorts) {
      const updates = {};

      if (short.videoUrl && short.videoUrl.match(/^https?:\/\//)) {
        updates.videoUrl = extractRelativePath(short.videoUrl);
        console.log(`Short ${short._id}: videoUrl ${short.videoUrl} -> ${updates.videoUrl}`);
      }

      if (short.thumbnailUrl && short.thumbnailUrl.match(/^https?:\/\//)) {
        updates.thumbnailUrl = extractRelativePath(short.thumbnailUrl);
        console.log(`Short ${short._id}: thumbnailUrl ${short.thumbnailUrl} -> ${updates.thumbnailUrl}`);
      }

      if (Object.keys(updates).length > 0) {
        await Short.updateOne({ _id: short._id }, { $set: updates });
      }
    }

    console.log('\nMigration completed successfully!');

  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run migration
migrateToRelativeUrls();
