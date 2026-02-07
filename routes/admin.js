const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const Category = require('../models/Category');
const HeroBanner = require('../models/HeroBanner');
const { protect, admin } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { deleteFromCloudinary } = require('../middleware/uploadUtils');
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
  try {
    if (!images || !Array.isArray(images)) {
      console.log('📷 No images provided or invalid format');
      return [];
    }
    
    console.log(`📷 Transforming ${images.length} images...`);
    
    const transformed = images
      .filter(img => img) // Remove null/undefined entries first
      .map((img, index) => {
        try {
          // If already an object, return as-is
          if (typeof img === 'object' && img.url && img.public_id) {
            console.log(`   ✅ Image ${index + 1}: Already formatted`);
            return img;
          }
          
          // If it's a string URL, extract public_id from Cloudinary URL
          if (typeof img === 'string' && img.trim()) {
            // Cloudinary URL format: https://res.cloudinary.com/{cloud_name}/image/upload/v{version}/{public_id}.{ext}
            // Extract public_id from URL
            const match = img.match(/\/upload\/(?:v\d+\/)?(.+?)\.[^.]+$/);
            const public_id = match ? match[1] : img.split('/').pop().split('.')[0];
            
            console.log(`   ✅ Image ${index + 1}: Extracted public_id = ${public_id}`);
            
            return {
              url: img,
              public_id: public_id
            };
          }
          
          // Invalid image - return null to filter out
          console.log(`   ⚠️  Image ${index + 1}: Invalid, will be filtered out`);
          return null;
        } catch (imgErr) {
          console.error(`   ❌ Error transforming image ${index + 1}:`, imgErr.message);
          return null;
        }
      })
      .filter(img => img && img.url && img.public_id); // Remove null entries
    
    console.log(`📷 Transformed ${transformed.length} valid images`);
    return transformed;
  } catch (err) {
    console.error('❌ Error in transformImages:', err.message);
    return [];
  }
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

// Test endpoint - Create minimal product
router.post('/listings/test-minimal', protect, admin, async (req, res) => {
    try {
        console.log('🧪 TEST MINIMAL: Creating basic product...');
        
        // Absolutely minimal data - only required fields
        const minimalData = {
            title: 'Test',
            description: 'Test Desc',
            category: req.body.category || '507f1f77bcf86cd799439011', // dummy ObjectId
            price: 10,
            stock: 1,
            productLink: 'https://test.com',
            createdBy: req.user._id,
            type: 'product'
        };

        console.log('🧪 Creating instance...');
        const product = new Product(minimalData);
        
        console.log('🧪 Saving...');
        await product.save();

        res.json({ success: true, data: product, message: 'Test passed!' });
    } catch (err) {
        console.error('🧪 TEST FAILED:', err.message, err.stack);
        res.status(500).json({ 
            success: false,
            error: err.message,
            stack: err.stack.substring(0, 200)
        });
    }
});

// POST /api/admin/listings - Create new listing
router.post('/listings', protect, admin, async (req, res) => {
    try {
        console.log('📝 Creating new listing...');
        console.log('   User ID:', req.user?._id);
        console.log('   User Email:', req.user?.email);

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

        // -----------------------------
        // Input sanitization & coercion
        // -----------------------------
        const listingType = (type || 'product').toString();

        // Validate category ObjectId early
        if (!category || !mongoose.Types.ObjectId.isValid(category)) {
            return res.status(400).json({ success: false, error: 'Invalid or missing category id' });
        }

        // Coerce numeric fields if provided as strings
        const parsedPrice = (price !== undefined && price !== '') ? Number(price) : undefined;
        const parsedStock = (stock !== undefined && stock !== '') ? parseInt(stock, 10) : undefined;

        // If listing is a product, ensure price and stock are present and numeric
        if (listingType === 'product') {
            if (parsedPrice === undefined || Number.isNaN(parsedPrice)) {
                return res.status(400).json({ success: false, error: 'Price is required and must be a number for product listings' });
            }
            if (parsedStock === undefined || Number.isNaN(parsedStock)) {
                return res.status(400).json({ success: false, error: 'Stock is required and must be an integer for product listings' });
            }
        }

        // Normalize jobType: null when empty, and validate allowed values
        const JOB_TYPES = ['full-time', 'part-time', 'contract', 'freelance', 'internship'];
        let normalizedJobType = null;
        if (listingType === 'job') {
            if (jobType && JOB_TYPES.includes(jobType)) normalizedJobType = jobType;
            else normalizedJobType = null; // sanitize invalid/empty jobType
        }

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

        // Validate and get user ID
        if (!req.user || !req.user._id) {
            console.error('❌ User not authenticated or user._id missing:', req.user);
            return res.status(401).json({
                success: false,
                error: 'User authentication failed'
            });
        }

        const listingData = {
            type: type || 'product',
            title: (title || '').trim(),
            slug,
            description: (description || '').trim(),
            category,
            images: Array.isArray(images) ? transformImages(images) : [], // Ensure images is always an array
            tags: Array.isArray(tags) ? tags.filter(t => t) : [],
            // DO NOT set reviews here - let schema handle it with default
            cartEnabled: cartEnabled !== undefined ? cartEnabled : (type === 'product'),
            status: status || 'draft',
            isFeatured: isFeatured || false,
            metaTitle: (metaTitle || title || '').trim(),
            metaDescription: (metaDescription || description || '').substring(0, 160).trim(),
            views: 0,
            clicks: 0,
            conversions: 0,
            pricingType: pricingType || 'paid',
            createdBy: req.user._id // Add the user who created the listing
        };

        // Add type-specific fields
        if (listingType === 'product') {
            listingData.price = parsedPrice; // numeric and already validated
            listingData.stock = parsedStock; // numeric and already validated
            listingData.originalPrice = (req.body.originalPrice !== undefined && req.body.originalPrice !== '') ? parseFloat(req.body.originalPrice) : parsedPrice;
            listingData.productLink = (externalLink && externalLink.trim()) || 'https://example.com'; // Use externalLink for productLink
        }

        if (listingType === 'tool' || listingType === 'job') {
            listingData.externalLink = externalLink;
            listingData.affiliateSource = affiliateSource;
            listingData.affiliateId = affiliateId;
            listingData.productLink = (externalLink && externalLink.trim()) || 'https://example.com'; // Set productLink for compatibility
        }

        if (listingType === 'tool') {
            listingData.platform = Array.isArray(platform) ? platform : [];
            listingData.features = Array.isArray(features) ? features : [];
            listingData.integrations = Array.isArray(integrations) ? integrations : [];
        }

        if (listingType === 'job') {
            listingData.companyName = companyName || '';
            listingData.jobType = normalizedJobType;
            listingData.location = location || '';
            listingData.salary = salary || '';
            listingData.experienceLevel = experienceLevel || 'any';
            listingData.applicationDeadline = applicationDeadline || null;
        }

        console.log('📋 Listing data prepared:', {
            title,
            type,
            category,
            createdBy: req.user._id,
            imageCount: listingData.images.length,
            price: listingData.price,
            stock: listingData.stock
        });

        console.log('🔧 Creating Product instance with data:', JSON.stringify(listingData).substring(0, 200));
        const listing = new Product(listingData);
        console.log('✅ Product instance created successfully');
        console.log('🔧 Calling listing.save()...');
        
        await listing.save();
        console.log('✅ Listing saved to database:', listing._id);

        // Populate category before sending response
        await listing.populate('category');

        res.status(201).json({
            success: true,
            data: listing,
            message: 'Listing created successfully'
        });
    } catch (err) {
        console.error('❌ Error creating listing:', {
            message: err.message,
            code: err.code,
            name: err.name,
            path: err.path,
            value: err.value,
            errors: err.errors ? Object.keys(err.errors) : null,
            fullError: err.toString(),
            stack: err.stack ? err.stack.substring(0, 800) : 'No stack'
        });

        // Log full error if it contains discriminatorKey
        if (err.message && err.message.includes('discriminatorKey')) {
            console.error('🔍 DISCRIMINATOR KEY ERROR DETECTED - Full error:', err);
        }

        // Handle MongoDB validation errors
        if (err.name === 'ValidationError') {
            const validationErrors = Object.values(err.errors)
                .map(e => `${e.path}: ${e.message}`)
                .join(', ');
            return res.status(400).json({
                success: false,
                error: `Validation failed: ${validationErrors}`
            });
        }

        // Handle MongoDB cast errors
        if (err.name === 'CastError') {
            return res.status(400).json({
                success: false,
                error: `Invalid ID format for field: ${err.path}`
            });
        }

        res.status(500).json({ 
            success: false, 
            error: err.message || 'Failed to create listing',
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
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

// ============================================
// CATEGORY MANAGEMENT (Admin Routes)
// ============================================

// Get all categories (for admin panel)
router.get('/categories', protect, admin, async (req, res) => {
  try {
    const categories = await Category.find()
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
    
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create category (Admin only)
router.post('/categories', protect, admin, upload.single('image'), async (req, res) => {
  try {
    const { name, description, type = 'product' } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ message: 'Image is required' });
    }

    // Validate type
    const validTypes = ['product', 'offer', 'job', 'software'];
    if (!validTypes.includes(type)) {
      if (req.file && req.file.filename) {
        await deleteFromCloudinary(req.file.filename);
      }
      return res.status(400).json({ message: 'Invalid category type' });
    }

    const category = new Category({
      name,
      description,
      type,
      image: {
        url: req.file.path,
        public_id: req.file.filename
      },
      createdBy: req.user._id
    });

    const createdCategory = await category.save();
    res.status(201).json(createdCategory);
  } catch (error) {
    // Delete uploaded image if category creation fails
    if (req.file && req.file.filename) {
      await deleteFromCloudinary(req.file.filename);
    }
    res.status(400).json({ message: error.message });
  }
});

// Update category (Admin only)
router.put('/categories/:id', protect, admin, upload.single('image'), async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    
    if (category) {
      const oldImagePublicId = category.image.public_id;
      
      category.name = req.body.name || category.name;
      category.description = req.body.description || category.description;
      
      // Update type if provided
      if (req.body.type) {
        const validTypes = ['product', 'offer', 'job', 'software'];
        if (!validTypes.includes(req.body.type)) {
          if (req.file && req.file.filename) {
            await deleteFromCloudinary(req.file.filename);
          }
          return res.status(400).json({ message: 'Invalid category type' });
        }
        category.type = req.body.type;
      }
      
      if (req.file) {
        // Update image
        category.image = {
          url: req.file.path,
          public_id: req.file.filename
        };
        
        // Delete old image from Cloudinary
        await deleteFromCloudinary(oldImagePublicId);
      }

      const updatedCategory = await category.save();
      res.json(updatedCategory);
    } else {
      // Delete uploaded image if category not found
      if (req.file && req.file.filename) {
        await deleteFromCloudinary(req.file.filename);
      }
      res.status(404).json({ message: 'Category not found' });
    }
  } catch (error) {
    // Delete uploaded image if update fails
    if (req.file && req.file.filename) {
      await deleteFromCloudinary(req.file.filename);
    }
    res.status(400).json({ message: error.message });
  }
});

// Delete category (Admin only)
router.delete('/categories/:id', protect, admin, async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    
    if (category) {
      // Delete image from Cloudinary
      await deleteFromCloudinary(category.image.public_id);
      
      // Soft delete category
      category.isActive = false;
      await category.save();
      
      res.json({ message: 'Category removed' });
    } else {
      res.status(404).json({ message: 'Category not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;