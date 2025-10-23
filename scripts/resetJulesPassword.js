
/**
 * Script to reset Jules password directly in DB
 */

const mongoose = require('mongoose');
const User = require('../src/models/user.model');
require('dotenv').config();

async function resetJulesPassword() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');

    // Find user
    const user = await User.findOne({ email: 'jules@gmail.com' });
    if (!user) {
      console.log('❌ Jules user not found');
      return;
    }

    console.log('✅ Jules user found');

    // Update password directly (the pre-save hook will hash it)
    user.password = 'password123';
    user.status = 'active';
    user.role = 'user';
    await user.save();

    console.log('✅ Password updated successfully');

    // Test authentication
    const testUser = await User.findOne({ email: 'jules@gmail.com' });
    const isMatch = await testUser.comparePassword('password123');
    console.log(`Password test: ${isMatch ? '✅ Success' : '❌ Failed'}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Database connection closed');
  }
}

resetJulesPassword();
