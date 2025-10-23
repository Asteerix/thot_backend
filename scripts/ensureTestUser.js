require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/user.model');
const bcrypt = require('bcryptjs');

async function ensureTestUser() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check if test user exists
    let testUser = await User.findOne({ email: 'test@test.com' });

    if (!testUser) {
      // Create test user
      testUser = new User({
        name: 'Test User',
        username: 'testuser_' + Date.now(),
        email: 'test@test.com',
        password: 'password123',
        role: 'user',
        status: 'active',
        isEmailVerified: true,
        interactions: {
          followedJournalists: [],
          readHistory: [],
          savedPosts: [],
          preferences: {
            categories: [],
            notificationSettings: {
              email: true,
              push: true,
              sms: false
            }
          }
        }
      });

      await testUser.save();
      console.log('✅ Test user created');
    } else {
      // Update password
      testUser.password = 'password123';
      await testUser.save();
      console.log('✅ Test user password updated');
    }

    console.log('Test user details:');
    console.log('  Email:', testUser.email);
    console.log('  Username:', testUser.username);
    console.log('  Password: password123');

    // Test login
    const isMatch = await bcrypt.compare('password123', testUser.password);
    console.log('  Password verification:', isMatch ? '✅' : '❌');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n📌 Disconnected from MongoDB');
  }
}

ensureTestUser();
