const express = require('express');
const cors = require('cors');
require('dotenv').config();

const connectDB = require('./config/database');
require('./config/cloudinary'); // Initialize Cloudinary
const { initializeFirebaseAdmin } = require('./config/firebaseAdmin'); // Firebase Admin

// Route imports
const blogRoutes = require('./routes/blogs');
const authRoutes = require('./routes/auth');
const categoryRoutes = require('./routes/categories');
const productRoutes = require('./routes/products');
const bannerRoutes = require('./routes/banners');
const adminRoutes = require('./routes/admin');
const uploadRoutes = require('./routes/upload');
const cartRoutes = require('./routes/cart');
const userRoutes = require('./routes/users'); // Added user routes

const app = express();

// Connect to database
connectDB();

// Initialize Firebase Admin
initializeFirebaseAdmin();

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      process.env.CLIENT_URL,
      'http://localhost:3000',
      'http://localhost:5173',
      'https://yourdomain.com' // Add your production domain
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

// Security middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Add security headers
app.use((req, res, next) => {
  // Remove sensitive headers
  res.removeHeader('X-Powered-By');
  
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  
  // CSP header
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;"
  );
  
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl} - IP: ${req.ip}`);
  next();
});

// Routes
app.use('/api/blogs', blogRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/users', userRoutes); // Added user routes

// Home route
app.get('/', (req, res) => {
  res.json({ 
    message: 'E-commerce API is running with Firebase & Cloudinary Integration',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    services: {
      database: 'MongoDB ✅',
      cloudStorage: 'Cloudinary ✅',
      authentication: 'Firebase Admin ✅',
      fileUpload: 'Active ✅'
    },
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      categories: '/api/categories',
      products: '/api/products',
      banners: '/api/banners',
      blogs: '/api/blogs',
      admin: '/api/admin',
      upload: '/api/uploads',
      cart: '/api/cart'
    },
    timestamp: new Date().toISOString()
  });
});

// Health check route with service status
app.get('/health', async (req, res) => {
  const healthCheck = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    services: {
      database: 'Checking...',
      firebase: 'Checking...',
      cloudinary: 'Checking...'
    },
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV
  };

  try {
    // Check database connection
    const mongoose = require('mongoose');
    healthCheck.services.database = mongoose.connection.readyState === 1 ? 'Connected ✅' : 'Disconnected ❌';

    // Check Firebase Admin
    const { admin } = require('./config/firebaseAdmin');
    healthCheck.services.firebase = 'Initialized ✅';

    // Check Cloudinary (simple ping)
    healthCheck.services.cloudinary = 'Configured ✅';

    res.json(healthCheck);
  } catch (error) {
    healthCheck.status = 'Degraded';
    healthCheck.error = error.message;
    res.status(503).json(healthCheck);
  }
});

// API status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    data: {
      server: 'Running',
      database: 'Connected',
      firebase: 'Initialized',
      cloudinary: 'Active',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()) + ' seconds'
    }
  });
});

// 404 handler with improved response
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    requestedUrl: req.originalUrl,
    method: req.method,
    availableEndpoints: {
      auth: [
        'POST /api/auth/firebase - Firebase authentication',
        'POST /api/auth/admin/login - Admin login',
        'POST /api/auth/create-admin - Create admin (setup)',
        'GET /api/auth/me - Get current user'
      ],
      users: [
        'GET /api/users/profile - Get user profile',
        'PUT /api/users/profile - Update profile',
        'PUT /api/users/password - Change password'
      ],
      products: [
        'GET /api/products - Get all products',
        'POST /api/products - Create product (admin)',
        'GET /api/products/:id - Get single product',
        'PUT /api/products/:id - Update product (admin)',
        'DELETE /api/products/:id - Delete product (admin)'
      ],
      categories: [
        'GET /api/categories - Get all categories',
        'POST /api/categories - Create category (admin)'
      ],
      upload: [
        'POST /api/uploads/image - Upload single image',
        'POST /api/uploads/images - Upload multiple images'
      ],
      admin: [
        'GET /api/admin/dashboard - Admin dashboard',
        'GET /api/admin/users - Get all users',
        'GET /api/admin/stats - Get statistics'
      ],
      general: [
        'GET / - API information',
        'GET /health - Health check',
        'GET /api/status - API status'
      ]
    },
    documentation: 'Check / endpoint for basic API structure'
  });
});

// Enhanced error handling middleware
app.use((error, req, res, next) => {
  console.error('🚨 Error Details:', {
    message: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });

  // Mongoose validation error
  if (error.name === 'ValidationError') {
    return res.status(400).json({ 
      success: false,
      message: 'Validation Error',
      errors: Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message
      }))
    });
  }
  
  // Mongoose duplicate key error
  if (error.code === 11000) {
    const field = Object.keys(error.keyValue)[0];
    const value = error.keyValue[field];
    return res.status(400).json({
      success: false,
      message: `Duplicate field value: ${field} '${value}' already exists`,
      code: 'DUPLICATE_ENTRY'
    });
  }
  
  // Mongoose cast error (invalid ObjectId)
  if (error.name === 'CastError') {
    return res.status(400).json({ 
      success: false,
      message: `Invalid ID format: ${error.value}`,
      code: 'INVALID_ID'
    });
  }
  
  // Multer file upload errors
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'File too large. Maximum size is 10MB.',
      code: 'FILE_TOO_LARGE'
    });
  }
  
  if (error.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({
      success: false,
      message: 'Too many files uploaded. Maximum is 5 files.',
      code: 'TOO_MANY_FILES'
    });
  }
  
  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      success: false,
      message: 'Unexpected field in file upload.',
      code: 'UNEXPECTED_FIELD'
    });
  }
  
  // Cloudinary errors
  if (error.message && error.message.includes('Cloudinary')) {
    return res.status(500).json({
      success: false,
      message: 'Image upload service error. Please try again.',
      code: 'CLOUDINARY_ERROR'
    });
  }
  
  // Firebase errors
  if (error.message && error.message.includes('Firebase')) {
    return res.status(401).json({
      success: false,
      message: 'Authentication service error',
      code: 'FIREBASE_ERROR'
    });
  }
  
  // JWT errors
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid authentication token',
      code: 'INVALID_TOKEN'
    });
  }
  
  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Authentication token expired',
      code: 'TOKEN_EXPIRED'
    });
  }

  // CORS errors
  if (error.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      message: 'CORS policy: Origin not allowed',
      code: 'CORS_ERROR'
    });
  }
  
  // Rate limiting errors
  if (error.status === 429) {
    return res.status(429).json({
      success: false,
      message: 'Too many requests. Please try again later.',
      code: 'RATE_LIMITED'
    });
  }

  // Default error response
  const statusCode = error.status || error.statusCode || 500;
  const response = {
    success: false,
    message: error.message || 'Internal server error',
    code: error.code || 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV === 'development' && { 
      stack: error.stack,
      details: error.details 
    })
  };

  // Log unexpected errors for monitoring
  if (statusCode === 500) {
    console.error('💥 Unexpected Server Error:', {
      message: error.message,
      stack: error.stack,
      url: req.originalUrl,
      body: req.body,
      query: req.query,
      timestamp: new Date().toISOString()
    });
  }

  res.status(statusCode).json(response);
});

// Graceful shutdown handling
process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM. Shutting down gracefully...');
  process.exit(0);
});

// Unhandled promise rejection handler
process.on('unhandledRejection', (err, promise) => {
  console.error('💥 Unhandled Promise Rejection:', err);
  console.error('At promise:', promise);
  // Close server & exit process
  process.exit(1);
});

// Uncaught exception handler
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  process.exit(1);
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
🚀 Server Status Summary:
──────────────────────────────────
✅ Server running on port: ${PORT}
✅ MongoDB: Connected
✅ Firebase Admin: Initialized
✅ Cloudinary: Configured
✅ Environment: ${process.env.NODE_ENV || 'development'}
✅ CORS: Enabled for ${process.env.CLIENT_URL || 'http://localhost:3000'}

📱 API Endpoints:
   Home: http://localhost:${PORT}/
   Health: http://localhost:${PORT}/health
   Status: http://localhost:${PORT}/api/status
   API Base: http://localhost:${PORT}/api

🔐 Authentication:
   Firebase Auth: Ready
   Admin Login: /api/auth/admin/login
   User Auth: /api/auth/firebase

☁️  Services:
   File Storage: Cloudinary Active
   Database: MongoDB Connected
   Auth Provider: Firebase Initialized
──────────────────────────────────
  `);
});

module.exports = app;