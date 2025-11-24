// scripts/set-admin-password.js
// Usage: node scripts/set-admin-password.js --email=admin@example.com --password=NewPass123!
require('dotenv').config();
const connectDB = require('../config/database');
const User = require('../models/User');

// Simple CLI args parsing to avoid extra deps
const argv = process.argv.slice(2);
let email, password;
argv.forEach((arg) => {
  if (arg.startsWith('--email=')) email = arg.split('=')[1];
  if (arg.startsWith('--password=')) password = arg.split('=')[1];
  if (arg.startsWith('-e=')) email = arg.split('=')[1];
  if (arg.startsWith('-p=')) password = arg.split('=')[1];
});

if (!email || !password) {
  console.error('Usage: node scripts/set-admin-password.js --email=admin@example.com --password=YourPassword');
  process.exit(1);
}

(async () => {
  try {
    await connectDB();

    let user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (user) {
      console.log('Found existing user:', user.email, ' - updating password and role to admin');
      user.password = password; // pre-save will hash
      user.role = 'admin';
      user.authProvider = 'email';
      user.isEmailVerified = true;
      await user.save();
      console.log('Admin password updated for', user.email);
    } else {
      console.log('No user found with that email - creating new admin user');
      user = await User.create({
        name: 'Administrator',
        email: email.toLowerCase(),
        password,
        role: 'admin',
        authProvider: 'email',
        isEmailVerified: true,
        isActive: true
      });
      console.log('Admin user created:', user.email);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error setting admin password:', err);
    process.exit(1);
  }
})();
