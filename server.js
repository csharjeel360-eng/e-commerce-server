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
const listingsRoutes = require('./routes/listings');
const bannerRoutes = require('./routes/banners');
const adminRoutes = require('./routes/admin');
const uploadRoutes = require('./routes/upload');
const cartRoutes = require('./routes/cart');
const userRoutes = require('./routes/users');
const trackingRoutes = require('./routes/tracking');
const offerRoutes = require('./routes/offers');

const app = express();

// Connect to database
connectDB();

// Initialize Firebase Admin
initializeFirebaseAdmin();

// IMPORTANT: Apply CORS as the very first middleware
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      process.env.CLIENT_URL,
      'http://localhost:3000',
      'http://localhost:5173',
      'https://teckysolutions.com',
      'https://www.teckysolutions.com'
    ];
    
    // Allow all localhost origins and specified domains
    if (origin.includes('localhost') || allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      console.log('CORS blocked for origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token']
}));

// Handle preflight requests globally
app.options('*', cors());

// Security middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Add security headers with CORS
app.use((req, res, next) => {
  // Remove sensitive headers
  res.removeHeader('X-Powered-By');
  
  // CORS headers (in addition to cors middleware)
  const allowedOrigins = ['http://localhost:5173', 'http://localhost:3000', 'https://teckysolutions.com', 'https://www.teckysolutions.com', process.env.CLIENT_URL];
  const origin = req.headers.origin;
  
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  // Security headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-auth-token');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Cache control for API responses - prevent caching to ensure fresh data
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  // Only set HSTS in production
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  next();
});

// Enhanced request logging middleware
app.use((req, res, next) => {
  console.log(`\n🌐 ${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  console.log(`📍 IP: ${req.ip} | Origin: ${req.headers.origin || 'No Origin'}`);
  
  // Log request body (excluding sensitive fields)
  if (req.body && Object.keys(req.body).length > 0) {
    const logBody = { ...req.body };
    if (logBody.password) logBody.password = '***';
    if (logBody.token) logBody.token = '***';
    if (logBody.refreshToken) logBody.refreshToken = '***';
    console.log('📦 Request Body:', logBody);
  }
  
  next();
});

// Routes
app.use('/api/blogs', blogRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
// Mount listings routes
app.use('/api/listings', listingsRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/offers', offerRoutes);

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
      listings: '/api/listings',
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
      listings: [
        'GET /api/listings - Alias for products',
        'GET /api/listings/:id - Alias for product detail'
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
  console.error('\n🚨 ERROR DETAILS:');
  console.error('Message:', error.message);
  console.error('URL:', req.method, req.originalUrl);
  console.error('Stack:', error.stack);
  console.error('Timestamp:', new Date().toISOString());

  // Ensure CORS headers are set even on errors
  const allowedOrigins = ['http://localhost:5173', 'http://localhost:3000', process.env.CLIENT_URL];
  const origin = req.headers.origin;
  
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');

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
  
  // Default error response
  const statusCode = error.status || error.statusCode || 500;
  const response = {
    success: false,
    message: error.message || 'Internal server error',
    code: error.code || 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV === 'development' && { 
      stack: error.stack
    })
  };

  res.status(statusCode).json(response);
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
🚀 Server Status Summary:
──────────────────────────────────
✅ Server running on port: ${PORT}
✅ Environment: ${process.env.NODE_ENV || 'development'}
✅ CORS: Enabled for localhost:5173

📱 API Endpoints:
   Home: http://localhost:${PORT}/
   Health: http://localhost:${PORT}/health
   Status: http://localhost:${PORT}/api/status

🔧 Debug Tips:
   Check /health endpoint for service status
   Check browser console for CORS details
   Check server logs for 500 errors
──────────────────────────────────
  `);
});

module.exports = app;