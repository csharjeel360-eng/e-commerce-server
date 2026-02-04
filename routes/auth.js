// routes/auth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const { admin } = require('../config/firebaseAdmin');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const router = express.Router();

// Middleware to ensure fresh auth responses - prevent caching
router.use((req, res, next) => {
  // Set cache headers to prevent caching of auth responses
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  // Add timestamp to ETag to force revalidation
  res.setHeader('ETag', `"${Date.now()}"`);
  
  next();
});

// @desc    Get current authenticated user
// @route   GET /api/auth/me
// @access  Protected (JWT)
router.get('/me', protect, async (req, res) => {
  try {
    // req.user is attached by protect middleware
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    res.json({ success: true, data: req.user });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch current user' });
  }
});

// Verify Firebase Token
const verifyFirebaseToken = async (idToken) => {
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    console.error('Firebase token verification error:', error);
    throw new Error('Invalid or expired Firebase token');
  }
};

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });
};

// @desc    Firebase authentication
// @route   POST /api/auth/firebase
// @access  Public
router.post('/firebase', async (req, res) => {
  try {
    const { idToken, provider = 'google' } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: 'Firebase ID token is required'
      });
    }

    // Verify Firebase token
    const firebaseUser = await verifyFirebaseToken(idToken);
    
    console.log('Firebase user authenticated:', {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      emailVerified: firebaseUser.email_verified
    });

    // Check if user exists in database
    let user = await User.findOne({ 
      $or: [
        { email: firebaseUser.email },
        { firebaseUID: firebaseUser.uid }
      ]
    });

    if (user) {
      // Update existing user
      user.lastLogin = new Date();
      user.authProvider = provider;
      user.firebaseUID = firebaseUser.uid;
      user.isEmailVerified = firebaseUser.email_verified || user.isEmailVerified;
      
      if (provider === 'google') {
        user.googleId = firebaseUser.uid;
        if (!user.photoURL && firebaseUser.picture) {
          user.photoURL = firebaseUser.picture;
        }
        if (!user.name && firebaseUser.name) {
          user.name = firebaseUser.name;
        }
      }
      
      await user.save();
      console.log('Existing user updated:', user.email);
    } else {
      // Create new user (only regular users, not admins)
      // Prevent admin creation through social signup
      const existingAdmin = await User.findOne({ 
        email: firebaseUser.email, 
        role: 'admin' 
      });
      
      if (existingAdmin) {
        return res.status(400).json({
          success: false,
          message: 'Admin accounts cannot be created through social signup. Please use admin login.'
        });
      }

      user = await User.create({
        name: firebaseUser.name || firebaseUser.email.split('@')[0],
        email: firebaseUser.email,
        password: Math.random().toString(36).slice(-16) + Math.random().toString(36).slice(-16), // Secure random password
        authProvider: provider,
        photoURL: firebaseUser.picture || null,
        isEmailVerified: firebaseUser.email_verified || false,
        firebaseUID: firebaseUser.uid,
        googleId: provider === 'google' ? firebaseUser.uid : undefined,
        lastLogin: new Date(),
        role: 'user' // Always set as regular user for social signup
      });
      console.log('New user created:', user.email);
    }

    // Generate JWT token
    const token = generateToken(user._id);

    res.json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        authProvider: user.authProvider,
        isEmailVerified: user.isEmailVerified,
        photoURL: user.photoURL,
        token: token,
      }
    });

  } catch (error) {
    console.error('Firebase authentication error:', error);
    res.status(401).json({
      success: false,
      message: error.message
    });
  }
});

// @desc    Admin login (email/password only)
// @route   POST /api/auth/admin/login
// @access  Public
router.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    // Find admin user
    const user = await User.findOne({ 
      email: email.toLowerCase(), 
      role: { $in: ['admin', 'superadmin'] } 
    }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid admin credentials'
      });
    }

    // Check password
    let isPasswordValid = false;
    try {
      isPasswordValid = await user.matchPassword(password);
    } catch (pwErr) {
      console.error('Password compare error for admin login:', pwErr);
      isPasswordValid = false;
    }

    // If password check failed, attempt a safe migration for plaintext-stored passwords.
    // This only triggers when the stored password equals the provided password exactly —
    // indicating the record was likely inserted without hashing. We then set the password
    // (causing pre-save hashing) and proceed.
    if (!isPasswordValid) {
      try {
        const stored = user.password;
        // Only attempt migration if stored password exists and matches the provided password exactly
        if (stored && stored === password) {
          console.warn('Detected unhashed admin password in DB; migrating to hashed password for user:', user.email);
          user.password = password; // pre-save middleware will hash
          await user.save();
          // Re-check password after migration
          isPasswordValid = await user.matchPassword(password);
        }
      } catch (migrateErr) {
        console.error('Admin password migration attempt failed:', migrateErr);
      }
    }

    if (!isPasswordValid) {
      console.warn('Admin login failed for user:', email, ' - password invalid');
      return res.status(401).json({
        success: false,
        message: 'Invalid admin credentials'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    res.json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        authProvider: user.authProvider,
        isEmailVerified: user.isEmailVerified,
        token: token,
      }
    });

  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during admin login'
    });
  }
});

// @desc    Create initial admin user
// @route   POST /api/auth/create-admin
// @access  Public (protect this in production)
router.post('/create-admin', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if admin already exists
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Admin user already exists'
      });
    }

    // Create admin user
    const adminUser = await User.create({
      name: name || 'Administrator',
      email: email || process.env.ADMIN_EMAIL,
      password: password || process.env.ADMIN_INITIAL_PASSWORD,
      role: 'admin',
      authProvider: 'email',
      isEmailVerified: true,
      isActive: true
    });

    console.log('Admin user created successfully:', adminUser.email);

    res.status(201).json({
      success: true,
      message: 'Admin user created successfully',
      data: {
        _id: adminUser._id,
        name: adminUser.name,
        email: adminUser.email,
        role: adminUser.role
      }
    });
  } catch (error) {
    console.error('Create admin error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;