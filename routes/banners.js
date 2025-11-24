// routes/banners.js
const express = require('express');
const HeroBanner = require('../models/HeroBanner');
const { protect, admin } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { deleteFromCloudinary } = require('../middleware/uploadUtils');
const router = express.Router();

// Get all active banners
router.get('/', async (req, res) => {
  try {
    const banners = await HeroBanner.find({ isActive: true })
      .sort({ order: 1, createdAt: -1 });
    res.json(banners);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get banner by ID
router.get('/:id', async (req, res) => {
  try {
    const banner = await HeroBanner.findById(req.params.id);
    
    if (banner) {
      res.json(banner);
    } else {
      res.status(404).json({ message: 'Banner not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get banners by position - ADD THIS ROUTE
router.get('/position/:position', async (req, res) => {
  try {
    const { position } = req.params;
    console.log('🎯 Fetching banners for position:', position);
    
    const banners = await HeroBanner.find({ 
      position: position,
      isActive: true 
    }).sort({ order: 1, createdAt: -1 });
    
    console.log(`✅ Found ${banners.length} banners for position: ${position}`);
    res.json(banners);
  } catch (error) {
    console.error('❌ Error fetching banners by position:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get homepage banners - ADD THIS ROUTE
router.get('/homepage/all', async (req, res) => {
  try {
    const banners = await HeroBanner.find({ 
      position: { $in: ['home-top', 'home-middle', 'home-bottom'] },
      isActive: true 
    }).sort({ order: 1, createdAt: -1 });
    
    console.log(`🏠 Found ${banners.length} homepage banners`);
    res.json(banners);
  } catch (error) {
    console.error('❌ Error fetching homepage banners:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create banner (Admin only)
router.post('/', protect, admin, upload.single('image'), async (req, res) => {
  try {
    const { title, subtitle, buttonText, buttonLink, order, position } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ message: 'Image is required' });
    }

    const banner = new HeroBanner({
      title,
      subtitle,
      buttonText: buttonText || 'Shop Now',
      buttonLink,
      position: position || 'home-top',
      order: order || 0,
      image: {
        url: req.file.path,
        public_id: req.file.filename
      },
      createdBy: req.user._id
    });

    const createdBanner = await banner.save();
    res.status(201).json(createdBanner);
  } catch (error) {
    // Delete uploaded image if banner creation fails
    if (req.file && req.file.filename) {
      await deleteFromCloudinary(req.file.filename);
    }
    res.status(400).json({ message: error.message });
  }
});

// Update banner
router.put('/:id', protect, admin, upload.single('image'), async (req, res) => {
  try {
    const banner = await HeroBanner.findById(req.params.id);
    
    if (banner) {
      const oldImagePublicId = banner.image.public_id;
      
      banner.title = req.body.title || banner.title;
      banner.subtitle = req.body.subtitle || banner.subtitle;
      banner.buttonText = req.body.buttonText || banner.buttonText;
      banner.buttonLink = req.body.buttonLink || banner.buttonLink;
      banner.position = req.body.position || banner.position;
      banner.order = req.body.order || banner.order;
      banner.isActive = req.body.isActive !== undefined ? req.body.isActive : banner.isActive;
      
      if (req.file) {
        // Update image
        banner.image = {
          url: req.file.path,
          public_id: req.file.filename
        };
        
        // Delete old image from Cloudinary
        await deleteFromCloudinary(oldImagePublicId);
      }

      const updatedBanner = await banner.save();
      res.json(updatedBanner);
    } else {
      // Delete uploaded image if banner not found
      if (req.file && req.file.filename) {
        await deleteFromCloudinary(req.file.filename);
      }
      res.status(404).json({ message: 'Banner not found' });
    }
  } catch (error) {
    // Delete uploaded image if update fails
    if (req.file && req.file.filename) {
      await deleteFromCloudinary(req.file.filename);
    }
    res.status(400).json({ message: error.message });
  }
});

// Delete banner
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const banner = await HeroBanner.findById(req.params.id);
    
    if (banner) {
      // Delete image from Cloudinary
      await deleteFromCloudinary(banner.image.public_id);
      
      await HeroBanner.deleteOne({ _id: banner._id });
      res.json({ message: 'Banner removed' });
    } else {
      res.status(404).json({ message: 'Banner not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Toggle banner active status
router.patch('/:id/toggle', protect, admin, async (req, res) => {
  try {
    const banner = await HeroBanner.findById(req.params.id);
    
    if (banner) {
      banner.isActive = !banner.isActive;
      const updatedBanner = await banner.save();
      res.json(updatedBanner);
    } else {
      res.status(404).json({ message: 'Banner not found' });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Create sample banners for testing - ADD THIS ROUTE
router.post('/create-samples', protect, admin, async (req, res) => {
  try {
    const sampleBanners = [
      {
        title: "Summer Sale 2024",
        subtitle: "Up to 50% off on all products. Limited time offer!",
        buttonText: "Shop Now",
        buttonLink: "/products",
        position: "home-top",
        isActive: true,
        order: 1,
        image: {
          url: "https://images.unsplash.com/photo-1607082350899-7e105aa886ae?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1200&q=80",
          public_id: "summer-sale-banner"
        },
        createdBy: req.user._id
      },
      {
        title: "New Arrivals",
        subtitle: "Discover our latest collection of amazing products",
        buttonText: "Explore",
        buttonLink: "/products?sort=newest",
        position: "home-middle",
        isActive: true,
        order: 1,
        image: {
          url: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1200&q=80",
          public_id: "new-arrivals-banner"
        },
        createdBy: req.user._id
      },
      {
        title: "Free Shipping",
        subtitle: "Free shipping on all orders over $50. Shop now!",
        buttonText: "Learn More",
        buttonLink: "/shipping",
        position: "home-bottom",
        isActive: true,
        order: 1,
        image: {
          url: "https://images.unsplash.com/photo-1472851294608-062f824d29cc?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1200&q=80",
          public_id: "free-shipping-banner"
        },
        createdBy: req.user._id
      }
    ];

    // Clear existing banners first
    await HeroBanner.deleteMany({});
    
    const createdBanners = await HeroBanner.insertMany(sampleBanners);
    console.log('✅ Created sample banners:', createdBanners.length);
    
    res.json({
      message: 'Sample banners created successfully',
      banners: createdBanners
    });
  } catch (error) {
    console.error('❌ Error creating sample banners:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;