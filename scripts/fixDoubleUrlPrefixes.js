const mongoose = require('mongoose');
require('dotenv').config();

const Post = require('../src/models/post.model');

async function fixDoubleUrlPrefixes() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/thot');
    console.log('Connected to MongoDB');

    // Find all posts with double http://localhost:3000 prefix in any URL field
    const posts = await Post.find({
      $or: [
        { imageUrl: { $regex: '^http://localhost:3000/http://localhost:3000/' } },
        { thumbnailUrl: { $regex: '^http://localhost:3000/http://localhost:3000/' } },
        { videoUrl: { $regex: '^http://localhost:3000/http://localhost:3000/' } }
      ]
    });

    console.log(`Found ${posts.length} posts with double URL prefix`);

    for (const post of posts) {
      const updates = {};

      if (post.imageUrl && post.imageUrl.startsWith('http://localhost:3000/http://localhost:3000/')) {
        const oldUrl = post.imageUrl;
        const newUrl = oldUrl.replace('http://localhost:3000/http://localhost:3000/', 'http://localhost:3000/');
        console.log(`Fixing post ${post._id} imageUrl:`);
        console.log(`  Old: ${oldUrl}`);
        console.log(`  New: ${newUrl}`);
        updates.imageUrl = newUrl;
      }

      if (post.thumbnailUrl && post.thumbnailUrl.startsWith('http://localhost:3000/http://localhost:3000/')) {
        const oldUrl = post.thumbnailUrl;
        const newUrl = oldUrl.replace('http://localhost:3000/http://localhost:3000/', 'http://localhost:3000/');
        console.log(`Fixing post ${post._id} thumbnailUrl:`);
        console.log(`  Old: ${oldUrl}`);
        console.log(`  New: ${newUrl}`);
        updates.thumbnailUrl = newUrl;
      }

      if (post.videoUrl && post.videoUrl.startsWith('http://localhost:3000/http://localhost:3000/')) {
        const oldUrl = post.videoUrl;
        const newUrl = oldUrl.replace('http://localhost:3000/http://localhost:3000/', 'http://localhost:3000/');
        console.log(`Fixing post ${post._id} videoUrl:`);
        console.log(`  Old: ${oldUrl}`);
        console.log(`  New: ${newUrl}`);
        updates.videoUrl = newUrl;
      }

      if (Object.keys(updates).length > 0) {
        await Post.updateOne(
          { _id: post._id },
          { $set: updates }
        );
        console.log(`Updated post ${post._id}`);
      }
    }

    console.log('Done!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixDoubleUrlPrefixes();
