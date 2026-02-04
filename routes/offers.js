const express = require('express');
const Offer = require('../models/Offer');
const { protect, admin } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { deleteFromCloudinary } = require('../middleware/uploadUtils');
const router = express.Router();

// ============================================
// PUBLIC ROUTES - Get Offers
// ============================================

// GET /api/offers - Get all active offers
router.get('/', async (req, res) => {
  try {
    const { type, category, network, search, page = 1, limit = 10 } = req.query;
    
    let filter = { status: 'active' };
    
    if (type) filter.type = type;
    if (category) filter.category = category;
    if (network) filter.network = new RegExp(network, 'i');
    if (search) {
      filter.$or = [
        { title: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') },
        { network: new RegExp(search, 'i') }
      ];
    }

    const skip = (page - 1) * limit;
    const total = await Offer.countDocuments(filter);
    const offers = await Offer.find(filter)
      .populate('category', 'name')
      .populate('createdBy', 'name')
      .sort({ featured: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    res.json({
      success: true,
      data: offers,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Error fetching offers:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch offers' });
  }
});

// GET /api/offers/:id - Get single offer
router.get('/:id', async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id)
      .populate('category', 'name')
      .populate('createdBy', 'name');

    if (!offer) {
      return res.status(404).json({ success: false, error: 'Offer not found' });
    }

    res.json({ success: true, data: offer });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch offer' });
  }
});

// GET /api/offers/category/:categoryId - Get offers by category
router.get('/category/:categoryId', async (req, res) => {
  try {
    const offers = await Offer.find({
      category: req.params.categoryId,
      status: 'active'
    })
      .populate('category', 'name')
      .sort({ featured: -1, createdAt: -1 })
      .lean();

    res.json({ success: true, data: offers });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch offers' });
  }
});

// GET /api/offers/type/:type - Get offers by type
router.get('/type/:type', async (req, res) => {
  try {
    const offers = await Offer.find({
      type: req.params.type,
      status: 'active'
    })
      .populate('category', 'name')
      .sort({ featured: -1, createdAt: -1 })
      .lean();

    res.json({ success: true, data: offers });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch offers' });
  }
});

// ============================================
// ADMIN ROUTES - Manage Offers
// ============================================

// GET /api/offers/admin/all - Get all offers (admin)
router.get('/admin/all', protect, admin, async (req, res) => {
  try {
    const { type, status, network, category, search, page = 1, limit = 20 } = req.query;
    
    let filter = {};
    
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (network) filter.network = new RegExp(network, 'i');
    if (category) filter.category = category;
    if (search) {
      filter.$or = [
        { title: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') },
        { network: new RegExp(search, 'i') },
        { offerId: new RegExp(search, 'i') }
      ];
    }

    const skip = (page - 1) * limit;
    const total = await Offer.countDocuments(filter);
    const offers = await Offer.find(filter)
      .populate('category', 'name')
      .populate('createdBy', 'name')
      .populate('listing', 'title')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: offers,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Error fetching offers:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch offers' });
  }
});

// POST /api/offers/admin - Create offer (admin)
router.post('/admin', protect, admin, async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      trackingUrl,
      thumbnail,
      type = 'cpa',
      network = 'Direct',
      offerId,
      commission = 0,
      commissionType = 'fixed',
      status = 'active',
      startDate,
      endDate
    } = req.body;

    // Validate required fields
    if (!title || !description || !category || !trackingUrl) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: title, description, category, trackingUrl'
      });
    }

    // Generate unique offer ID if not provided
    const uniqueOfferId = offerId || `OFFER-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Check if offer ID is unique
    const existingOffer = await Offer.findOne({ offerId: uniqueOfferId });
    if (existingOffer && offerId) {
      return res.status(400).json({
        success: false,
        error: 'Offer ID already exists'
      });
    }

    const newOffer = new Offer({
      title,
      description,
      type,
      category,
      commission: parseFloat(commission) || 0,
      commissionType,
      network,
      offerId: uniqueOfferId,
      trackingUrl,
      thumbnail,
      status,
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: endDate ? new Date(endDate) : null,
      createdBy: req.user._id
    });

    await newOffer.save();
    await newOffer.populate('category', 'name');
    await newOffer.populate('createdBy', 'name');

    res.status(201).json({
      success: true,
      data: newOffer,
      message: 'Offer created successfully'
    });
  } catch (err) {
    console.error('Error creating offer:', err);
    res.status(500).json({ success: false, error: 'Failed to create offer' });
  }
});

// PUT /api/offers/admin/:id - Update offer (admin)
router.put('/admin/:id', protect, admin, async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);

    if (!offer) {
      return res.status(404).json({ success: false, error: 'Offer not found' });
    }

    // Allowed update fields
    const allowedFields = [
      'title', 'description', 'category', 'trackingUrl', 'thumbnail', 'type',
      'network', 'offerId', 'commission', 'commissionType', 'status', 'startDate', 'endDate'
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        offer[field] = req.body[field];
      }
    });

    await offer.save();
    await offer.populate('category', 'name');
    await offer.populate('createdBy', 'name');

    res.json({
      success: true,
      data: offer,
      message: 'Offer updated successfully'
    });
  } catch (err) {
    console.error('Error updating offer:', err);
    res.status(500).json({ success: false, error: 'Failed to update offer' });
  }
});

// DELETE /api/offers/admin/:id - Delete offer (admin)
router.delete('/admin/:id', protect, admin, async (req, res) => {
  try {
    const offer = await Offer.findByIdAndDelete(req.params.id);

    if (!offer) {
      return res.status(404).json({ success: false, error: 'Offer not found' });
    }

    // Delete images from Cloudinary
    if (offer.images && offer.images.length > 0) {
      for (const img of offer.images) {
        if (img.publicId) {
          await deleteFromCloudinary(img.publicId);
        }
      }
    }

    res.json({
      success: true,
      message: 'Offer deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting offer:', err);
    res.status(500).json({ success: false, error: 'Failed to delete offer' });
  }
});

// PATCH /api/offers/admin/:id/toggle-featured - Toggle featured status
router.patch('/admin/:id/toggle-featured', protect, admin, async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);

    if (!offer) {
      return res.status(404).json({ success: false, error: 'Offer not found' });
    }

    offer.featured = !offer.featured;
    await offer.save();

    res.json({
      success: true,
      data: offer,
      message: `Offer ${offer.featured ? 'featured' : 'unfeatured'}`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to toggle featured status' });
  }
});

// PATCH /api/offers/admin/:id/status - Update offer status
router.patch('/admin/:id/status', protect, admin, async (req, res) => {
  try {
    const { status } = req.body;

    if (!['active', 'inactive', 'expired', 'pending'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const offer = await Offer.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate('category', 'name');

    res.json({
      success: true,
      data: offer,
      message: 'Offer status updated'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update status' });
  }
});

// ============================================
// ADMIN STATS
// ============================================

// GET /api/offers/admin/stats - Get offer statistics
router.get('/admin/stats', protect, admin, async (req, res) => {
  try {
    const stats = {
      totalOffers: await Offer.countDocuments({}),
      activeOffers: await Offer.countDocuments({ status: 'active' }),
      inactiveOffers: await Offer.countDocuments({ status: 'inactive' }),
      expiredOffers: await Offer.countDocuments({ status: 'expired' }),
      pendingOffers: await Offer.countDocuments({ status: 'pending' }),
      featuredOffers: await Offer.countDocuments({ featured: true }),
      byType: {
        cpa: await Offer.countDocuments({ type: 'cpa' }),
        cpc: await Offer.countDocuments({ type: 'cpc' }),
        cpm: await Offer.countDocuments({ type: 'cpm' }),
        cpv: await Offer.countDocuments({ type: 'cpv' }),
        revenue_share: await Offer.countDocuments({ type: 'revenue_share' })
      }
    };

    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

module.exports = router;
