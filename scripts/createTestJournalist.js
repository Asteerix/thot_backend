const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../src/models/user.model');
require('dotenv').config();

async function createTestJournalist() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/thot', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('Connected to MongoDB');

    const existingUser = await User.findOne({ email: 'journaliste@test.com' });

    if (existingUser) {
      console.log('User already exists, updating password...');
      const hashedPassword = await bcrypt.hash('Elmer777?', 10);
      existingUser.password = hashedPassword;
      existingUser.role = 'journalist';
      existingUser.firstName = 'Test';
      existingUser.lastName = 'Journalist';
      existingUser.username = 'testjournalist';
      await existingUser.save();
      console.log('Password updated successfully');
    } else {
      const hashedPassword = await bcrypt.hash('Elmer777?', 10);

      const newUser = new User({
        email: 'journaliste@test.com',
        password: hashedPassword,
        firstName: 'Test',
        lastName: 'Journalist',
        username: 'testjournalist',
        role: 'journalist',
        isVerified: true
      });

      await newUser.save();
      console.log('Test journalist created successfully');
    }

    console.log('✅ Test journalist ready:');
    console.log('Email: journaliste@test.com');
    console.log('Password: Elmer777?');

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

createTestJournalist();