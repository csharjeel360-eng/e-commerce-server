// middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Enhanced authentication middleware with security features
 */

// Token blacklist for logout functionality (in production, use Redis)
const tokenBlacklist = new Set();

// Rate limiting for authentication attempts
const authAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes

/**
 * Clear old auth attempts to prevent memory leaks
 */
const cleanupAuthAttempts = () => {
    const now = Date.now();
    for (const [key, data] of authAttempts.entries()) {
        if (now - data.timestamp > LOCKOUT_TIME) {
            authAttempts.delete(key);
        }
    }
};

// Run cleanup every hour
setInterval(cleanupAuthAttempts, 60 * 60 * 1000);

/**
 * Check if IP is rate limited
 */
const isRateLimited = (ip) => {
    const attempt = authAttempts.get(ip);
    if (!attempt) return false;

    if (Date.now() - attempt.timestamp > LOCKOUT_TIME) {
        authAttempts.delete(ip);
        return false;
    }

    return attempt.count >= MAX_ATTEMPTS;
};

/**
 * Record authentication attempt
 */
const recordAuthAttempt = (ip, success) => {
    if (success) {
        authAttempts.delete(ip);
        return;
    }

    const attempt = authAttempts.get(ip) || { count: 0, timestamp: Date.now() };
    attempt.count++;
    attempt.timestamp = Date.now();
    authAttempts.set(ip, attempt);
};

/**
 * Extract token from various sources
 */
const extractToken = (req) => {
    // 1. Check Authorization header (Bearer token)
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        return req.headers.authorization.split(' ')[1];
    }

    // 2. Check x-auth-token header
    if (req.headers['x-auth-token']) {
        return req.headers['x-auth-token'];
    }

    // 3. Check cookies
    if (req.cookies && req.cookies.token) {
        return req.cookies.token;
    }

    // 4. Check query parameters (for specific use cases)
    if (req.query.token) {
        return req.query.token;
    }

    return null;
};

/**
 * Get client IP address
 */
const getClientIP = (req) => {
    return req.ip || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
           'unknown';
};

/**
 * Main authentication middleware
 */
const protect = async (req, res, next) => {
    const clientIP = getClientIP(req);
    
    console.log('🔐 Auth Middleware - Starting authentication check');
    console.log('   URL:', req.originalUrl);
    console.log('   Method:', req.method);
    console.log('   Client IP:', clientIP);

    // Check rate limiting
    if (isRateLimited(clientIP)) {
        console.log('   ❌ Rate limited - too many failed attempts');
        return res.status(429).json({
            success: false,
            message: 'Too many authentication attempts. Please try again later.',
            retryAfter: Math.ceil((LOCKOUT_TIME - (Date.now() - authAttempts.get(clientIP).timestamp)) / 1000 / 60)
        });
    }

    try {
        // Extract token from request
        const token = extractToken(req);

        if (!token) {
            console.log('   ❌ No authentication token found');
            // Do NOT record auth attempts for missing tokens. Guests or unauthenticated
            // clients may legitimately hit protected endpoints; the client should
            // handle 401 and fall back to local behavior. Recording here causes
            // quick lockouts (429) for normal unauthenticated usage.
            return res.status(401).json({
                success: false,
                message: 'Access denied. No authentication token provided.',
                code: 'NO_TOKEN'
            });
        }

        // Check if token is blacklisted (logout)
        if (tokenBlacklist.has(token)) {
            console.log('   ❌ Token is blacklisted (logged out)');
            return res.status(401).json({
                success: false,
                message: 'Token has been invalidated. Please login again.',
                code: 'TOKEN_BLACKLISTED'
            });
        }

        console.log('   Token found, verifying...');

        // Verify JWT token
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (jwtError) {
            console.log('   ❌ JWT verification failed:', jwtError.message);
            
            let errorMessage = 'Invalid token';
            let statusCode = 401;

            if (jwtError.name === 'TokenExpiredError') {
                errorMessage = 'Token has expired. Please login again.';
                statusCode = 401;
            } else if (jwtError.name === 'JsonWebTokenError') {
                errorMessage = 'Malformed token. Please login again.';
                statusCode = 400;
            }

            // Record failed authentication attempt only when a token was supplied
            // but failed verification — this indicates an attempted authentication
            // rather than an unauthenticated client.
            recordAuthAttempt(clientIP, false);
            return res.status(statusCode).json({
                success: false,
                message: errorMessage,
                code: jwtError.name
            });
        }

        console.log('   ✅ Token valid for user:', decoded.id);

        // Find user in database
        const user = await User.findById(decoded.id).select('-password');
        
        if (!user) {
            console.log('   ❌ User not found in database');
            // Token was verified but user not found - record as failed attempt
            recordAuthAttempt(clientIP, false);
            return res.status(401).json({
                success: false,
                message: 'User not found. Token is invalid.',
                code: 'USER_NOT_FOUND'
            });
        }

        // Check if user account is active
        if (!user.isActive) {
            console.log('   ❌ User account is deactivated');
            return res.status(403).json({
                success: false,
                message: 'Account has been deactivated. Please contact support.',
                code: 'ACCOUNT_DEACTIVATED'
            });
        }

        // Check if user is locked (if you have lock functionality)
        if (user.security?.lockUntil && user.security.lockUntil > Date.now()) {
            console.log('   ❌ User account is temporarily locked');
            return res.status(423).json({
                success: false,
                message: 'Account is temporarily locked due to suspicious activity.',
                code: 'ACCOUNT_LOCKED'
            });
        }

        // Attach user to request
        req.user = user;
        req.token = token;

        console.log('   ✅ Authentication successful');
        console.log('   User:', user._id, '| Role:', user.role, '| Email:', user.email);

        // Record successful authentication
        recordAuthAttempt(clientIP, true);

        next();
    } catch (error) {
        console.error('   💥 Authentication middleware error:', error);
        recordAuthAttempt(clientIP, false);
        
        return res.status(500).json({
            success: false,
            message: 'Authentication server error. Please try again.',
            code: 'SERVER_ERROR'
        });
    }
};

/**
 * Admin authorization middleware
 */
const admin = (req, res, next) => {
    console.log('👑 Admin Middleware - Checking admin privileges');
    console.log('   User ID:', req.user?._id);
    console.log('   User Role:', req.user?.role);

    if (!req.user) {
        console.log('   ❌ No user object found in request');
        return res.status(401).json({
            success: false,
            message: 'Authentication required before checking admin privileges.',
            code: 'NO_USER'
        });
    }

    const allowedRoles = ['admin', 'superadmin']; // Extendable role system
    
    if (allowedRoles.includes(req.user.role)) {
        console.log('   ✅ Admin access granted');
        next();
    } else {
        console.log('   ❌ Admin access denied - insufficient privileges');
        return res.status(403).json({
            success: false,
            message: 'Access denied. Admin privileges required.',
            code: 'INSUFFICIENT_PRIVILEGES',
            requiredRole: 'admin',
            currentRole: req.user.role
        });
    }
};

/**
 * Role-based authorization middleware
 */
const requireRole = (allowedRoles) => {
    return (req, res, next) => {
        console.log('🎭 Role Check Middleware - Checking user role');
        console.log('   Allowed Roles:', allowedRoles);
        console.log('   User Role:', req.user?.role);

        if (!req.user) {
            console.log('   ❌ No user object found');
            return res.status(401).json({
                success: false,
                message: 'Authentication required.',
                code: 'NO_USER'
            });
        }

        // Convert single role to array for consistency
        const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

        if (rolesArray.includes(req.user.role)) {
            console.log('   ✅ Role access granted');
            next();
        } else {
            console.log('   ❌ Role access denied');
            return res.status(403).json({
                success: false,
                message: `Access denied. Required role: ${rolesArray.join(' or ')}`,
                code: 'INSUFFICIENT_ROLE',
                requiredRoles: rolesArray,
                currentRole: req.user.role
            });
        }
    };
};

/**
 * Optional authentication middleware
 * - Doesn't fail if no token, but still attaches user if token is valid
 */
const optionalAuth = async (req, res, next) => {
    console.log('🔓 Optional Auth Middleware - Checking for optional authentication');

    try {
        const token = extractToken(req);

        if (token && !tokenBlacklist.has(token)) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id).select('-password');
            
            if (user && user.isActive) {
                req.user = user;
                req.token = token;
                console.log('   ✅ Optional auth - User authenticated:', user._id);
            }
        }
    } catch (error) {
        // Silently fail for optional auth - don't attach user
        console.log('   ℹ️ Optional auth - No valid token or user not found');
    }

    next();
};

/**
 * Logout middleware - blacklist token
 */
const logout = (req, res, next) => {
    console.log('🚪 Logout Middleware - Invalidating token');
    
    const token = extractToken(req);
    
    if (token) {
        tokenBlacklist.add(token);
        console.log('   ✅ Token blacklisted');
        
        // Optional: Set expiration for blacklisted tokens (cleanup)
        setTimeout(() => {
            tokenBlacklist.delete(token);
        }, 24 * 60 * 60 * 1000); // Remove after 24 hours
    }

    next();
};

/**
 * Security headers middleware
 */
const securityHeaders = (req, res, next) => {
    // Remove sensitive headers
    res.removeHeader('X-Powered-By');
    
    // Add security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    
    // CSP header (adjust based on your needs)
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
    );

    next();
};

/**
 * Get current user middleware (for WebSocket/GraphQL contexts)
 */
const getCurrentUser = async (token) => {
    if (!token || tokenBlacklist.has(token)) {
        return null;
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
        return user && user.isActive ? user : null;
    } catch (error) {
        return null;
    }
};

/**
 * Rate limiting middleware for specific routes
 */
const createRateLimiter = (windowMs, maxRequests) => {
    const requests = new Map();

    setInterval(() => {
        const now = Date.now();
        for (const [key, data] of requests.entries()) {
            if (now - data.timestamp > windowMs) {
                requests.delete(key);
            }
        }
    }, windowMs);

    return (req, res, next) => {
        const key = getClientIP(req) + req.originalUrl;
        const current = requests.get(key) || { count: 0, timestamp: Date.now() };

        if (Date.now() - current.timestamp > windowMs) {
            current.count = 0;
            current.timestamp = Date.now();
        }

        current.count++;

        if (current.count > maxRequests) {
            return res.status(429).json({
                success: false,
                message: 'Too many requests. Please slow down.',
                retryAfter: Math.ceil((windowMs - (Date.now() - current.timestamp)) / 1000)
            });
        }

        requests.set(key, current);
        next();
    };
};

module.exports = {
    protect,
    admin,
    requireRole,
    optionalAuth,
    logout,
    securityHeaders,
    getCurrentUser,
    createRateLimiter,
    tokenBlacklist, // Export for management if needed
    recordAuthAttempt // Export for testing
};