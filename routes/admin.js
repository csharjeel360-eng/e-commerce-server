const express = require('express');
const User = require('../models/User');
const Product = require('../models/Product');
const Category = require('../models/Category');
const HeroBanner = require('../models/HeroBanner');
const { protect, admin } = require('../middleware/auth');
const router = express.Router();

// Middleware to ensure fresh data and prevent caching for admin routes
router.use((req, res, next) => {
    // Set cache headers to prevent caching of admin responses
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Add ETag header to force revalidation
    res.setHeader('ETag', `"${Date.now()}"`);
    
    next();
});

// Get dashboard statistics
router.get('/dashboard', protect, admin, async (req, res) => {
    try {
        const totalProducts = await Product.countDocuments({ isActive: true });
        const totalCategories = await Category.countDocuments({ isActive: true });
        const totalUsers = await User.countDocuments({ isActive: true });
        const totalBanners = await HeroBanner.countDocuments({ isActive: true });

        const popularProducts = await Product.find({ isActive: true })
            .sort({ buyClicks: -1, views: -1 })
            .limit(5)
            .select('title buyClicks views averageRating');

        const recentProducts = await Product.find({ isActive: true })
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('category', 'name')
            .select('title price category createdAt');

        res.json({
            stats: {
                totalProducts,
                totalCategories,
                totalUsers,
                totalBanners
            },
            popularProducts,
            recentProducts
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get all users (Admin only)
router.get('/users', protect, admin, async (req, res) => {
    try {
        const users = await User.find({})
            .select('-password')
            .sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;