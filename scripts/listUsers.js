const mongoose = require('mongoose');
const User = require('../src/models/user.model');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

async function listUsers() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/thot', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('Connected to MongoDB');
    console.log('Database:', mongoose.connection.db.databaseName);
    console.log('\n=== LISTING ALL USERS ===\n');

    // Find all users and select specific fields
    const users = await User.find({}, 'username email role createdAt')
      .sort({ createdAt: -1 }); // Sort by newest first

    if (users.length === 0) {
      console.log('No users found in the database.');
    } else {
      // Display users in a formatted table
      console.log('Username'.padEnd(25) + 'Email'.padEnd(35) + 'Role'.padEnd(15) + 'Created');
      console.log('-'.repeat(90));

      users.forEach(user => {
        const username = (user.username || 'N/A').padEnd(25);
        const email = (user.email || 'N/A').padEnd(35);
        const role = (user.role || 'user').padEnd(15);
        const created = user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A';

        console.log(`${username}${email}${role}${created}`);
      });

      console.log('-'.repeat(90));
      console.log(`\nTotal users: ${users.length}`);

      // Count users by role
      const roleCounts = users.reduce((acc, user) => {
        const role = user.role || 'user';
        acc[role] = (acc[role] || 0) + 1;
        return acc;
      }, {});

      console.log('\nUsers by role:');
      Object.entries(roleCounts).forEach(([role, count]) => {
        console.log(`  ${role}: ${count}`);
      });
    }

  } catch (error) {
    console.error('Error listing users:', error);
  } finally {
    // Close the connection
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

// Run the script
listUsers();
