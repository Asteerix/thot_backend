/* eslint-disable */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/user.model');

async function deleteTestUser() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    const _result = await User.deleteOne({ email: 'test@test.com' });
    console.log('Deleted:', result.deletedCount, 'user(s)');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('📌 Disconnected from MongoDB');
  }
}

deleteTestUser();
