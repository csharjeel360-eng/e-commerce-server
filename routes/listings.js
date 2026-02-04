 const express = require('express');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const { protect, admin } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { deleteFromCloudinary } = require('../middleware/uploadUtils');
const router = express.Router();

// Public Listings routes (alias for products)
// Get all listings with filtering and pagination
router.get('/', async (req, res) => {
  try {
    const pageSize = 10;
    const page = Number(req.query.pageNumber) || 1;
    const keyword = req.query.keyword ? {
      title: {
        $regex: req.query.keyword,
        $options: 'i'
      }
    } : {};

    const count = await Product.countDocuments({ ...keyword, isActive: true });
    const products = await Product.find({ ...keyword, isActive: true })
      .populate('category', 'name')
      .populate('createdBy', 'name')
      .populate('reviews.user', 'name')
      .limit(pageSize)
      .skip(pageSize * (page - 1))
      .sort({ createdAt: -1 });

    res.json({
      products,
      page,
      pages: Math.ceil(count / pageSize),
      total: count
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single listing
router.get('/:id', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid listing id' });
  }
  try {
    const product = await Product.findById(req.params.id)
      .populate('category', 'name')
      .populate('createdBy', 'name')
      .populate('reviews.user', 'name');

    if (product && product.isActive) {
      product.views += 1;
      await product.save();
      res.json(product);
    } else {
      res.status(404).json({ message: 'Listing not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get listing by slug (compatibility)
router.get('/slug/:slug', async (req, res) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug, isActive: true })
      .populate('category', 'name')
      .populate('createdBy', 'name')
      .populate('reviews.user', 'name');

    if (product) return res.json(product);
    return res.status(404).json({ message: 'Listing not found' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create listing (Admin only) - kept for backward compatibility; admin routes handle advanced creation
router.post('/', protect, admin, upload.array('images', 10), async (req, res) => {
  try {
    const { title, description, price, category, stock, tags, productLink } = req.body;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'At least one image is required' });
    }

    if (!productLink) {
      return res.status(400).json({ message: 'Product link is required' });
    }

    const product = new Product({
      title,
      description,
      price,
      category,
      stock,
      productLink,
      tags: tags ? tags.split(',') : [],
      images: req.files.map(file => ({
        url: file.path,
        public_id: file.filename
      })),
      createdBy: req.user._id
    });

    const createdProduct = await product.save();
    res.status(201).json(createdProduct);
  } catch (error) {
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await deleteFromCloudinary(file.filename);
      }
    }
    res.status(400).json({ message: error.message });
  }
});

// The rest of CRUD endpoints mirror the previous products.js file
// Update listing
router.put('/:id', protect, admin, upload.array('images', 10), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid listing id' });
  }
  try {
    const product = await Product.findById(req.params.id);
    
    if (product) {
      product.title = req.body.title || product.title;
      product.description = req.body.description || product.description;
      product.price = req.body.price || product.price;
      product.category = req.body.category || product.category;
      product.stock = req.body.stock || product.stock;
      product.productLink = req.body.productLink || product.productLink;
      product.tags = req.body.tags ? req.body.tags.split(',') : product.tags;
      
      if (req.body.deletedImages) {
        try {
          const deletedImageIds = JSON.parse(req.body.deletedImages);
          for (const publicId of deletedImageIds) {
            await deleteFromCloudinary(publicId);
          }
          product.images = product.images.filter(img => !deletedImageIds.includes(img.public_id));
        } catch (parseError) {
          console.error('Error parsing deletedImages:', parseError);
        }
      }
      
      if (req.files && req.files.length > 0) {
        const newImages = req.files.map(file => ({ url: file.path, public_id: file.filename }));
        product.images = [...product.images, ...newImages];
      }

      const updatedProduct = await product.save();
      res.json(updatedProduct);
    } else {
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          await deleteFromCloudinary(file.filename);
        }
      }
      res.status(404).json({ message: 'Listing not found' });
    }
  } catch (error) {
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await deleteFromCloudinary(file.filename);
      }
    }
    res.status(400).json({ message: error.message });
  }
});

// Delete listing image
router.delete('/:id/images/:imageId', protect, admin, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid listing id' });
  }
  try {
    const product = await Product.findById(req.params.id);
    
    if (product) {
      const imageIndex = product.images.findIndex(
        img => img._id.toString() === req.params.imageId
      );
      
      if (imageIndex !== -1) {
        const imageToDelete = product.images[imageIndex];
        await deleteFromCloudinary(imageToDelete.public_id);
        product.images.splice(imageIndex, 1);
        await product.save();
        res.json({ message: 'Image deleted successfully' });
      } else {
        res.status(404).json({ message: 'Image not found' });
      }
    } else {
      res.status(404).json({ message: 'Listing not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add review
router.post('/:id/reviews', protect, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid listing id' });
  }
  try {
    const { rating, comment } = req.body;
    const product = await Product.findById(req.params.id);

    if (product) {
      const alreadyReviewed = product.reviews.find(
        review => review.user.toString() === req.user._id.toString()
      );

      if (alreadyReviewed) {
        return res.status(400).json({ message: 'Already reviewed' });
      }

      const review = { user: req.user._id, rating: Number(rating), comment };
      product.reviews.push(review);
      await product.save();

      res.status(201).json({ message: 'Review added' });
    } else {
      res.status(404).json({ message: 'Listing not found' });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Increment buy clicks
router.post('/:id/buy-click', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid listing id' });
  }
  try {
    const product = await Product.findById(req.params.id);
    
    if (product) {
      product.buyClicks += 1;
      await product.save();
      res.json({ message: 'Buy click recorded' });
    } else {
      res.status(404).json({ message: 'Listing not found' });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete listing (soft delete)
router.delete('/:id', protect, admin, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid listing id' });
  }
  try {
    const product = await Product.findById(req.params.id);
    
    if (product) {
      for (const image of product.images) {
        try { await deleteFromCloudinary(image.public_id); } catch (imgError) { console.error('Error deleting image', imgError); }
      }
      product.isActive = false;
      await product.save();
      res.json({ message: 'Listing removed' });
    } else {
      res.status(404).json({ message: 'Listing not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message, details: error.toString() });
  }
});

// Get featured listings
router.get('/featured/products', async (req, res) => {
  try {
    const products = await Product.find({ featured: true, isActive: true })
      .populate('category', 'name')
      .populate('createdBy', 'name')
      .limit(8)
      .sort({ createdAt: -1 });

    res.json({ products });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Compatibility: GET /listings/featured
router.get('/featured', async (req, res) => {
  try {
    const products = await Product.find({ featured: true, isActive: true })
      .populate('category', 'name')
      .populate('createdBy', 'name')
      .limit(12)
      .sort({ createdAt: -1 });
    res.json({ products });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Compatibility: GET /listings/popular
router.get('/popular', async (req, res) => {
  try {
    const products = await Product.find({ isActive: true })
      .populate('category', 'name')
      .populate('createdBy', 'name')
      .limit(12)
      .sort({ buyClicks: -1, views: -1 });
    res.json({ products });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get listings by category
router.get('/category/:categoryId', async (req, res) => {
  try {
    const pageSize = 10;
    const page = Number(req.query.pageNumber) || 1;
    
    const count = await Product.countDocuments({ category: req.params.categoryId, isActive: true });
    const products = await Product.find({ category: req.params.categoryId, isActive: true })
      .populate('category', 'name')
      .populate('createdBy', 'name')
      .limit(pageSize)
      .skip(pageSize * (page - 1))
      .sort({ createdAt: -1 });

    res.json({ products, page, pages: Math.ceil(count / pageSize), total: count });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Search listings (compatibility) - expects query param `q`
router.get('/search', async (req, res) => {
  try {
    const q = req.query.q || req.query.keyword || '';
    const pageSize = Number(req.query.pageSize) || 10;
    const page = Number(req.query.pageNumber) || 1;

    const keyword = q ? { title: { $regex: q, $options: 'i' } } : {};
    const count = await Product.countDocuments({ ...keyword, isActive: true });
    const products = await Product.find({ ...keyword, isActive: true })
      .populate('category', 'name')
      .populate('createdBy', 'name')
      .limit(pageSize)
      .skip(pageSize * (page - 1))
      .sort({ createdAt: -1 });

    res.json({ products, page, pages: Math.ceil(count / pageSize), total: count });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get listings by tag
router.get('/tag/:tag', async (req, res) => {
  try {
    const tag = req.params.tag;
    const products = await Product.find({ tags: tag, isActive: true })
      .populate('category', 'name')
      .populate('createdBy', 'name')
      .limit(20)
      .sort({ createdAt: -1 });
    res.json({ products });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get related listings
router.get('/:id/related', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid listing id' });
  try {
    const product = await Product.findById(req.params.id).select('category');
    if (!product) return res.status(404).json({ message: 'Listing not found' });

    const related = await Product.find({ category: product.category, _id: { $ne: req.params.id }, isActive: true })
      .limit(8)
      .populate('category', 'name')
      .populate('createdBy', 'name');

    res.json({ products: related });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/:id/view', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid listing id' });
  try {
    const product = await Product.findById(req.params.id);
    if (product) { product.views += 1; await product.save(); return res.json({ message: 'View recorded', views: product.views }); }
    return res.status(404).json({ message: 'Listing not found' });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

// Get listing reviews
router.get('/:id/reviews', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid listing id' });
  try {
    const product = await Product.findById(req.params.id).populate('reviews.user', 'name email').select('reviews averageRating');
    if (product) return res.json({ reviews: product.reviews, averageRating: product.averageRating, totalReviews: product.reviews.length });
    return res.status(404).json({ message: 'Listing not found' });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

module.exports = router;
