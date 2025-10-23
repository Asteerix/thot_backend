/* eslint-disable */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/user.model');
const bcrypt = require('bcryptjs');

async function setJulesPassword() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🔗 Connected to MongoDB');

    // Find and update the user
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    const _result = await User.updateOne(
      { email: 'jules@jules.com' },
      { $set: { password: hashedPassword } }
    );

    console.log('Update result:', result);

    // Verify it worked
    const _user = await User.findOne({ email: 'jules@jules.com' });
    if (user) {
      const isMatch = await bcrypt.compare('password123', user.password);
      console.log('✅ Password verification:', isMatch ? 'SUCCESS' : 'FAILED');
      console.log('Password hash:', user.password.substring(0, 20) + '...');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

setJulesPassword();
