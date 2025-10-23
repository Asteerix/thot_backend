
const mongoose = require('mongoose');
const User = require('../src/models/user.model');
require('dotenv').config();

async function resetPassword() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find the user
    const user = await User.findOne({ username: 'savedcontenttest' });

    if (!user) {
      console.log('❌ User savedcontenttest not found');
      return;
    }

    console.log('✅ Found user:', {
      id: user._id,
      username: user.username,
      email: user.email
    });

    // Update password
    user.password = 'password123';
    await user.save();

    console.log('✅ Password updated successfully');
    console.log('   New password: password123');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

resetPassword();
