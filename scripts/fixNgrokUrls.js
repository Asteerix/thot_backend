const mongoose = require('mongoose');
const { URL } = require('url');
const Post = require('../src/models/post.model');
const User = require('../src/models/user.model');
const Short = require('../src/models/short.model');
require('dotenv').config();

// Script to fix old ngrok URLs in the database
async function fixNgrokUrls() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('Connected to MongoDB');
    console.log('Starting ngrok URL fix...');

    // Function to extract relative path from any ngrok URL
    const fixNgrokUrl = (url) => {
      if (!url) {
        return null;
      }

      // Already a relative path
      if (url.startsWith('/')) {
        return url;
      }

      // Check if it's an ngrok URL
      if (url.includes('ngrok-free.app') || url.includes('ngrok.io')) {
        try {

          const urlObj = new URL(url);
          return urlObj.pathname;
        } catch {
          // Try to extract manually
          const matches = url.match(/https?:\/\/[^/]+(\/.*)/);
          if (matches && matches[1]) {
            return matches[1];
          }
        }
      }

      // Return as is if not ngrok URL
      return url;
    };

    // Fix Posts
    console.log('\nFixing Post URLs...');
    const posts = await Post.find({
      $or: [
        { imageUrl: { $regex: /ngrok/ } },
        { videoUrl: { $regex: /ngrok/ } },
        { thumbnailUrl: { $regex: /ngrok/ } }
      ]
    });

    console.log(`Found ${posts.length} posts with ngrok URLs`);

    for (const post of posts) {
      const updates = {};
      let hasChanges = false;

      if (post.imageUrl && post.imageUrl.includes('ngrok')) {
        updates.imageUrl = fixNgrokUrl(post.imageUrl);
        console.log(`Post ${post._id}: imageUrl ${post.imageUrl} -> ${updates.imageUrl}`);
        hasChanges = true;
      }

      if (post.videoUrl && post.videoUrl.includes('ngrok')) {
        updates.videoUrl = fixNgrokUrl(post.videoUrl);
        console.log(`Post ${post._id}: videoUrl ${post.videoUrl} -> ${updates.videoUrl}`);
        hasChanges = true;
      }

      if (post.thumbnailUrl && post.thumbnailUrl.includes('ngrok')) {
        updates.thumbnailUrl = fixNgrokUrl(post.thumbnailUrl);
        console.log(`Post ${post._id}: thumbnailUrl ${post.thumbnailUrl} -> ${updates.thumbnailUrl}`);
        hasChanges = true;
      }

      if (hasChanges) {
        await Post.updateOne({ _id: post._id }, { $set: updates });
      }
    }

    // Fix Users
    console.log('\nFixing User URLs...');
    const users = await User.find({
      $or: [
        { avatarUrl: { $regex: /ngrok/ } },
        { coverUrl: { $regex: /ngrok/ } }
      ]
    });

    console.log(`Found ${users.length} users with ngrok URLs`);

    for (const user of users) {
      const updates = {};
      let hasChanges = false;

      if (user.avatarUrl && user.avatarUrl.includes('ngrok')) {
        updates.avatarUrl = fixNgrokUrl(user.avatarUrl);
        console.log(`User ${user._id}: avatarUrl ${user.avatarUrl} -> ${updates.avatarUrl}`);
        hasChanges = true;
      }

      if (user.coverUrl && user.coverUrl.includes('ngrok')) {
        updates.coverUrl = fixNgrokUrl(user.coverUrl);
        console.log(`User ${user._id}: coverUrl ${user.coverUrl} -> ${updates.coverUrl}`);
        hasChanges = true;
      }

      if (hasChanges) {
        await User.updateOne({ _id: user._id }, { $set: updates });
      }
    }

    // Fix Shorts
    console.log('\nFixing Short URLs...');
    const shorts = await Short.find({
      $or: [
        { videoUrl: { $regex: /ngrok/ } },
        { thumbnailUrl: { $regex: /ngrok/ } }
      ]
    });

    console.log(`Found ${shorts.length} shorts with ngrok URLs`);

    for (const short of shorts) {
      const updates = {};
      let hasChanges = false;

      if (short.videoUrl && short.videoUrl.includes('ngrok')) {
        updates.videoUrl = fixNgrokUrl(short.videoUrl);
        console.log(`Short ${short._id}: videoUrl ${short.videoUrl} -> ${updates.videoUrl}`);
        hasChanges = true;
      }

      if (short.thumbnailUrl && short.thumbnailUrl.includes('ngrok')) {
        updates.thumbnailUrl = fixNgrokUrl(short.thumbnailUrl);
        console.log(`Short ${short._id}: thumbnailUrl ${short.thumbnailUrl} -> ${updates.thumbnailUrl}`);
        hasChanges = true;
      }

      if (hasChanges) {
        await Short.updateOne({ _id: short._id }, { $set: updates });
      }
    }

    console.log('\nNgrok URL fix completed successfully!');

  } catch (error) {
    console.error('Fix error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run fix
fixNgrokUrls();
