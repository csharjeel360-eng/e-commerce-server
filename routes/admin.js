const express = require('express');
const User = require('../models/User');
const Product = require('../models/Product');
const Category = require('../models/Category');
const HeroBanner = require('../models/HeroBanner');
const { protect, admin } = require('../middleware/auth');
const router = express.Router();

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Transform image URLs from frontend to proper image objects
 * Frontend sends array of URL strings from Cloudinary
 * Backend needs array of {url, public_id} objects
 */
const transformImages = (images) => {
  if (!images || !Array.isArray(images)) return [];
  
  return images.map(img => {
    // If already an object, return as-is
    if (typeof img === 'object' && img.url && img.public_id) {
      return img;
    }
    
    // If it's a string URL, extract public_id from Cloudinary URL
    if (typeof img === 'string') {
      // Cloudinary URL format: https://res.cloudinary.com/{cloud_name}/image/upload/v{version}/{public_id}.{ext}
      // Extract public_id from URL
      const match = img.match(/\/upload\/(?:v\d+\/)?(.+?)\.[^.]+$/);
      const public_id = match ? match[1] : img.split('/').pop().split('.')[0];
      
      return {
        url: img,
        public_id: public_id
      };
    }
    
    // Fallback for edge cases
    return {
      url: img.toString(),
      public_id: 'unknown'
    };
  });
};

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

// ============================================
// LISTINGS MANAGEMENT (Step 7 - New Routes)
// ============================================

// GET /api/admin/listings - Get all listings with optional filters
router.get('/listings', protect, admin, async (req, res) => {
    try {
        const { type, status, category } = req.query;
        const filter = {};

        if (type) filter.type = type;
        if (status) filter.status = status;
        if (category) filter.category = category;

        const listings = await Product.find(filter)
            .populate('category')
            .sort({ createdAt: -1 })
            .lean();

        res.json({
            success: true,
            data: listings,
            count: listings.length
        });
    } catch (err) {
        console.error('Error fetching listings:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch listings' });
    }
});

// GET /api/admin/listings/:id - Get single listing
router.get('/listings/:id', protect, admin, async (req, res) => {
    try {
        const listing = await Product.findById(req.params.id)
            .populate('category')
            .lean();

        if (!listing) {
            return res.status(404).json({ success: false, error: 'Listing not found' });
        }

        res.json({ success: true, data: listing });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch listing' });
    }
});

// POST /api/admin/listings - Create new listing
router.post('/listings', protect, admin, async (req, res) => {
    try {
        const {
            type,
            title,
            description,
            category,
            price,
            stock,
            images,
            tags,
            cartEnabled,
            externalLink,
            pricingType,
            platform,
            features,
            integrations,
            affiliateSource,
            affiliateId,
            companyName,
            jobType,
            location,
            salary,
            experienceLevel,
            applicationDeadline,
            metaTitle,
            metaDescription,
            status = 'draft',
            isFeatured = false
        } = req.body;

        // Validate required fields
        if (!title || !description || !category) {
            return res.status(400).json({
                success: false,
                error: 'Title, description, and category are required'
            });
        }

        // Type-specific validation
        if (type === 'product' && (!price || stock === undefined)) {
            return res.status(400).json({
                success: false,
                error: 'Price and stock are required for products'
            });
        }

        if ((type === 'tool' || type === 'job') && !externalLink) {
            return res.status(400).json({
                success: false,
                error: 'External link is required for tools and jobs'
            });
        }

        if (type === 'tool' && (!platform || platform.length === 0)) {
            return res.status(400).json({
                success: false,
                error: 'At least one platform is required for tools'
            });
        }

        if (type === 'job' && (!companyName || !jobType)) {
            return res.status(400).json({
                success: false,
                error: 'Company name and job type are required for jobs'
            });
        }

        // Create slug from title
        const slug = title
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/[\s_-]+/g, '-')
            .replace(/^-+|-+$/g, '');

        const listingData = {
            type,
            title,
            slug,
            description,
            category,
            images: transformImages(images), // Transform image URLs to proper objects
            tags: tags || [],
            cartEnabled: cartEnabled !== undefined ? cartEnabled : (type === 'product'),
            status,
            isFeatured,
            metaTitle: metaTitle || title,
            metaDescription: metaDescription || description.substring(0, 160),
            views: 0,
            clicks: 0,
            conversions: 0,
            pricingType: pricingType || 'paid',
            createdBy: req.user._id // Add the user who created the listing
        };

        // Add type-specific fields
        if (type === 'product') {
            listingData.price = price;
            listingData.stock = stock;
            listingData.originalPrice = req.body.originalPrice || price;
            listingData.productLink = externalLink || '#'; // Use externalLink for productLink
        }

        if (type === 'tool' || type === 'job') {
            listingData.externalLink = externalLink;
            listingData.affiliateSource = affiliateSource;
            listingData.affiliateId = affiliateId;
            listingData.productLink = externalLink || '#'; // Set productLink for compatibility
        }

        if (type === 'tool') {
            listingData.platform = platform || [];
            listingData.features = features || [];
            listingData.integrations = integrations || [];
        }

        if (type === 'job') {
            listingData.companyName = companyName;
            listingData.jobType = jobType;
            listingData.location = location;
            listingData.salary = salary;
            listingData.experienceLevel = experienceLevel || 'any';
            listingData.applicationDeadline = applicationDeadline;
        }

        const listing = new Product(listingData);
        await listing.save();

        // Populate category before sending response
        await listing.populate('category');

        res.status(201).json({
            success: true,
            data: listing,
            message: 'Listing created successfully'
        });
    } catch (err) {
        console.error('Error creating listing:', err);
        res.status(500).json({ success: false, error: 'Failed to create listing' });
    }
});

// PUT /api/admin/listings/:id - Update existing listing
router.put('/listings/:id', protect, admin, async (req, res) => {
    try {
        const listing = await Product.findById(req.params.id);

        if (!listing) {
            return res.status(404).json({ success: false, error: 'Listing not found' });
        }

        const {
            type,
            title,
            description,
            category,
            price,
            stock,
            images,
            tags,
            cartEnabled,
            externalLink,
            pricingType,
            platform,
            features,
            integrations,
            affiliateSource,
            affiliateId,
            companyName,
            jobType,
            location,
            salary,
            experienceLevel,
            applicationDeadline,
            metaTitle,
            metaDescription,
            status,
            isFeatured
        } = req.body;

        // Validate required fields
        if (title) listing.title = title;
        if (description) listing.description = description;
        if (category) listing.category = category;
        if (images) listing.images = transformImages(images); // Transform image URLs to proper objects
        if (tags) listing.tags = tags;

        // Update common fields
        if (cartEnabled !== undefined) listing.cartEnabled = cartEnabled;
        if (status) listing.status = status;
        if (isFeatured !== undefined) listing.isFeatured = isFeatured;
        if (metaTitle) listing.metaTitle = metaTitle;
        if (metaDescription) listing.metaDescription = metaDescription;
        if (pricingType) listing.pricingType = pricingType;

        // Update type-specific fields
        if (type === 'product') {
            if (price !== undefined) listing.price = price;
            if (stock !== undefined) listing.stock = stock;
            if (req.body.originalPrice !== undefined) listing.originalPrice = req.body.originalPrice;
            if (externalLink) listing.productLink = externalLink; // Update productLink for products
        }

        if (type === 'tool' || type === 'job') {
            if (externalLink) {
                listing.externalLink = externalLink;
                listing.productLink = externalLink; // Update productLink for tools/jobs
            }
            if (affiliateSource) listing.affiliateSource = affiliateSource;
            if (affiliateId) listing.affiliateId = affiliateId;
        }

        if (type === 'tool') {
            if (platform) listing.platform = platform;
            if (features) listing.features = features;
            if (integrations) listing.integrations = integrations;
        }

        if (type === 'job') {
            if (companyName) listing.companyName = companyName;
            if (jobType) listing.jobType = jobType;
            if (location) listing.location = location;
            if (salary) listing.salary = salary;
            if (experienceLevel) listing.experienceLevel = experienceLevel;
            if (applicationDeadline) listing.applicationDeadline = applicationDeadline;
        }

        await listing.save();
        await listing.populate('category');

        res.json({
            success: true,
            data: listing,
            message: 'Listing updated successfully'
        });
    } catch (err) {
        console.error('Error updating listing:', err);
        res.status(500).json({ success: false, error: 'Failed to update listing' });
    }
});

// DELETE /api/admin/listings/:id - Delete listing
router.delete('/listings/:id', protect, admin, async (req, res) => {
    try {
        const listing = await Product.findByIdAndDelete(req.params.id);

        if (!listing) {
            return res.status(404).json({ success: false, error: 'Listing not found' });
        }

        res.json({
            success: true,
            message: 'Listing deleted successfully'
        });
    } catch (err) {
        console.error('Error deleting listing:', err);
        res.status(500).json({ success: false, error: 'Failed to delete listing' });
    }
});

// GET /api/admin/listings/:id/analytics - Get analytics for a specific listing
router.get('/listings/:id/analytics', protect, admin, async (req, res) => {
    try {
        const listing = await Product.findById(req.params.id).lean();

        if (!listing) {
            return res.status(404).json({ success: false, error: 'Listing not found' });
        }

        const ctr = listing.clicks > 0 ? ((listing.clicks / listing.views) * 100).toFixed(2) : 0;
        const conversionRate = listing.clicks > 0 ? ((listing.conversions / listing.clicks) * 100).toFixed(2) : 0;

        res.json({
            success: true,
            data: {
                listingId: listing._id,
                title: listing.title,
                type: listing.type,
                views: listing.views || 0,
                clicks: listing.clicks || 0,
                conversions: listing.conversions || 0,
                ctr: parseFloat(ctr),
                conversionRate: parseFloat(conversionRate),
                revenue: (listing.conversions || 0) * (listing.price || 0)
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch analytics' });
    }
});

// GET /api/admin/analytics/summary - Get summary analytics across all listings
router.get('/analytics/summary', protect, admin, async (req, res) => {
    try {
        const listings = await Product.find({}).lean();

        const totalViews = listings.reduce((sum, l) => sum + (l.views || 0), 0);
        const totalClicks = listings.reduce((sum, l) => sum + (l.clicks || 0), 0);
        const totalConversions = listings.reduce((sum, l) => sum + (l.conversions || 0), 0);

        const ctr = totalClicks > 0 ? ((totalClicks / totalViews) * 100).toFixed(2) : 0;
        const conversionRate = totalClicks > 0 ? ((totalConversions / totalClicks) * 100).toFixed(2) : 0;

        // Group by type
        const byType = {
            product: { count: 0, views: 0, clicks: 0, conversions: 0 },
            tool: { count: 0, views: 0, clicks: 0, conversions: 0 },
            job: { count: 0, views: 0, clicks: 0, conversions: 0 }
        };

        listings.forEach(l => {
            if (byType[l.type]) {
                byType[l.type].count++;
                byType[l.type].views += l.views || 0;
                byType[l.type].clicks += l.clicks || 0;
                byType[l.type].conversions += l.conversions || 0;
            }
        });

        res.json({
            success: true,
            data: {
                total: {
                    listings: listings.length,
                    views: totalViews,
                    clicks: totalClicks,
                    conversions: totalConversions,
                    ctr: parseFloat(ctr),
                    conversionRate: parseFloat(conversionRate)
                },
                byType
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch summary' });
    }
});

module.exports = router;