const mongoose = require('mongoose');
const Post = require('../src/models/post.model');
require('dotenv').config();

async function listAllPosts() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to:', mongoose.connection.db.databaseName);

    // Get first 10 posts
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('title type status domain createdAt');

    console.log('\n=== RECENT POSTS ===');
    posts.forEach((post, index) => {
      console.log(`${index + 1}. ${post.title}`);
      console.log(`   Type: ${post.type}, Status: ${post.status}, Domain: ${post.domain}`);
      console.log(`   Created: ${post.createdAt}\n`);
    });

    // Count by status
    console.log('=== POST STATUS ===');
    const statuses = await Post.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    statuses.forEach(s => console.log(`${s._id}: ${s.count}`));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

listAllPosts();
