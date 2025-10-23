const mongoose = require('mongoose');
const Post = require('../src/models/post.model');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function updateImageUrls() {
  console.log('🔧 Updating image URLs from IP to localhost...');

  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find all posts with the old IP-based URLs
    const oldBaseUrl = 'http://192.168.1.14:3000';
    const newBaseUrl = 'http://localhost:3000';

    // Update posts
    const postsResult = await Post.updateMany(
      {
        $or: [
          { imageUrl: { $regex: oldBaseUrl } },
          { thumbnailUrl: { $regex: oldBaseUrl } },
          { videoUrl: { $regex: oldBaseUrl } }
        ]
      },
      [
        {
          $set: {
            imageUrl: {
              $cond: {
                if: { $ne: ['$imageUrl', null] },
                then: { $replaceAll: { input: '$imageUrl', find: oldBaseUrl, replacement: newBaseUrl } },
                else: '$imageUrl'
              }
            },
            thumbnailUrl: {
              $cond: {
                if: { $ne: ['$thumbnailUrl', null] },
                then: { $replaceAll: { input: '$thumbnailUrl', find: oldBaseUrl, replacement: newBaseUrl } },
                else: '$thumbnailUrl'
              }
            },
            videoUrl: {
              $cond: {
                if: { $ne: ['$videoUrl', null] },
                then: { $replaceAll: { input: '$videoUrl', find: oldBaseUrl, replacement: newBaseUrl } },
                else: '$videoUrl'
              }
            }
          }
        }
      ]
    );

    console.log(`✅ Updated ${postsResult.modifiedCount} posts`);

    // Update users avatars and covers
    const User = require('../src/models/user.model');
    const usersResult = await User.updateMany(
      {
        $or: [
          { avatarUrl: { $regex: oldBaseUrl } },
          { coverUrl: { $regex: oldBaseUrl } }
        ]
      },
      [
        {
          $set: {
            avatarUrl: {
              $cond: {
                if: { $ne: ['$avatarUrl', null] },
                then: { $replaceAll: { input: '$avatarUrl', find: oldBaseUrl, replacement: newBaseUrl } },
                else: '$avatarUrl'
              }
            },
            coverUrl: {
              $cond: {
                if: { $ne: ['$coverUrl', null] },
                then: { $replaceAll: { input: '$coverUrl', find: oldBaseUrl, replacement: newBaseUrl } },
                else: '$coverUrl'
              }
            }
          }
        }
      ]
    );

    console.log(`✅ Updated ${usersResult.modifiedCount} users`);

    console.log('\n✅ URL update completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error updating URLs:', error);
    process.exit(1);
  }
}

updateImageUrls();
