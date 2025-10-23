/* eslint-disable */
const mongoose = require('mongoose');
const Post = require('../src/models/post.model');
require('dotenv').config();

async function publishDraftPosts() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to:', mongoose.connection.db.databaseName);
    
    // Update all draft posts to published
    const _result = await Post.updateMany(
      { status: 'draft' },
      { $set: { status: 'published' } }
    );
    
    console.log(`Updated ${result.modifiedCount} posts from draft to published`);
    
    // Show updated stats
    console.log('\n=== UPDATED DATABASE STATS ===');
    const types = ['article', 'video', 'podcast', 'short', 'question'];
    let totalPublished = 0;
    
    for (const type of types) {
      const count = await Post.countDocuments({ 
        isDeleted: { $ne: true }, 
        status: 'published',
        type 
      });
      console.log(`${type}: ${count} published`);
      totalPublished += count;
    }
    
    console.log(`\nTotal published posts: ${totalPublished}`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

publishDraftPosts();
