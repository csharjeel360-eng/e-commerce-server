 const express = require('express');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const { protect, admin } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { deleteFromCloudinary } = require('../middleware/uploadUtils');
const router = express.Router();

// Get all products with filtering and pagination
router.get('/', async (req, res) => {
  try {
    const pageSize = 10;
    const page = Number(req.query.pageNumber) || 1;
    
    // Build search query that searches in multiple fields
    let searchQuery = { isActive: true };
    
    if (req.query.keyword) {
      const keyword = req.query.keyword;
      searchQuery = {
        isActive: true,
        $or: [
          { title: { $regex: keyword, $options: 'i' } },
          { description: { $regex: keyword, $options: 'i' } },
          { tags: { $regex: keyword, $options: 'i' } }
        ]
      };
    }

    const count = await Product.countDocuments(searchQuery);
    const products = await Product.find(searchQuery)
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

// Get single product
router.get('/:id', async (req, res) => {
  // Validate ObjectId to avoid casting errors when a non-id (e.g. 'cart') is passed
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid product id' });
  }
  try {
    const product = await Product.findById(req.params.id)
      .populate('category', 'name')
      .populate('createdBy', 'name')
      .populate('reviews.user', 'name');

    if (product && product.isActive) {
      // Increment views
      product.views += 1;
      await product.save();
      res.json(product);
    } else {
      res.status(404).json({ message: 'Product not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create product (Admin only)
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
    // Delete uploaded images if product creation fails
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await deleteFromCloudinary(file.filename);
      }
    }
    res.status(400).json({ message: error.message });
  }
});

// Update product
router.put('/:id', protect, admin, upload.array('images', 10), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid product id' });
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
      
      // Handle deleted images
      if (req.body.deletedImages) {
        try {
          const deletedImageIds = JSON.parse(req.body.deletedImages);
          console.log('🗑️ Deleting images from Cloudinary:', deletedImageIds);
          
          // Delete from Cloudinary
          for (const publicId of deletedImageIds) {
            await deleteFromCloudinary(publicId);
          }
          
          // Remove from product images array
          product.images = product.images.filter(img => !deletedImageIds.includes(img.public_id));
          console.log('✅ Images deleted and removed from product');
        } catch (parseError) {
          console.error('❌ Error parsing deletedImages:', parseError);
        }
      }
      
      if (req.files && req.files.length > 0) {
        // Add new images
        const newImages = req.files.map(file => ({
          url: file.path,
          public_id: file.filename
        }));
        product.images = [...product.images, ...newImages];
      }

      const updatedProduct = await product.save();
      res.json(updatedProduct);
    } else {
      // Delete uploaded images if product not found
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          await deleteFromCloudinary(file.filename);
        }
      }
      res.status(404).json({ message: 'Product not found' });
    }
  } catch (error) {
    // Delete uploaded images if update fails
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await deleteFromCloudinary(file.filename);
      }
    }
    res.status(400).json({ message: error.message });
  }
});

// Delete product image
router.delete('/:id/images/:imageId', protect, admin, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid product id' });
  }
  try {
    const product = await Product.findById(req.params.id);
    
    if (product) {
      const imageIndex = product.images.findIndex(
        img => img._id.toString() === req.params.imageId
      );
      
      if (imageIndex !== -1) {
        const imageToDelete = product.images[imageIndex];
        
        // Delete from Cloudinary
        await deleteFromCloudinary(imageToDelete.public_id);
        
        // Remove from product
        product.images.splice(imageIndex, 1);
        await product.save();
        
        res.json({ message: 'Image deleted successfully' });
      } else {
        res.status(404).json({ message: 'Image not found' });
      }
    } else {
      res.status(404).json({ message: 'Product not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add review
router.post('/:id/reviews', protect, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid product id' });
  }
  try {
    const { rating, comment } = req.body;
    const product = await Product.findById(req.params.id);

    if (product) {
      const alreadyReviewed = product.reviews.find(
        review => review.user.toString() === req.user._id.toString()
      );

      if (alreadyReviewed) {
        return res.status(400).json({ message: 'Product already reviewed' });
      }

      const review = {
        user: req.user._id,
        rating: Number(rating),
        comment
      };

      product.reviews.push(review);
      await product.save();

      res.status(201).json({ message: 'Review added' });
    } else {
      res.status(404).json({ message: 'Product not found' });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Increment buy clicks
router.post('/:id/buy-click', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid product id' });
  }
  try {
    const product = await Product.findById(req.params.id);
    
    if (product) {
      product.buyClicks += 1;
      await product.save();
      res.json({ message: 'Buy click recorded' });
    } else {
      res.status(404).json({ message: 'Product not found' });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete product
router.delete('/:id', protect, admin, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid product id' });
  }
  try {
    console.log('🗑️ DELETE request for product:', req.params.id);
    const product = await Product.findById(req.params.id);
    
    if (product) {
      console.log('📦 Found product:', product.title);
      console.log('🖼️ Deleting', product.images.length, 'images from Cloudinary');
      
      // Delete all images from Cloudinary
      for (const image of product.images) {
        try {
          console.log('   Deleting image:', image.public_id);
          await deleteFromCloudinary(image.public_id);
        } catch (imgError) {
          console.error('   ❌ Error deleting image:', imgError.message);
          // Continue with next image even if one fails
        }
      }
      
      console.log('✅ All images deleted');
      
      // Soft delete product
      product.isActive = false;
      await product.save();
      
      console.log('✅ Product marked as inactive');
      res.json({ message: 'Product removed' });
    } else {
      console.log('❌ Product not found');
      res.status(404).json({ message: 'Product not found' });
    }
  } catch (error) {
    console.error('❌ DELETE product error:', error);
    res.status(500).json({ message: error.message, details: error.toString() });
  }
});

// Get featured products
router.get('/featured/products', async (req, res) => {
  try {
    const products = await Product.find({ featured: true, isActive: true })
      .populate('category', 'name')
      .populate('createdBy', 'name')
      .limit(8)
      .sort({ createdAt: -1 });

    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get products by category
router.get('/category/:categoryId', async (req, res) => {
  try {
    const pageSize = 10;
    const page = Number(req.query.pageNumber) || 1;
    
    const count = await Product.countDocuments({ 
      category: req.params.categoryId, 
      isActive: true 
    });
    
    const products = await Product.find({ 
      category: req.params.categoryId, 
      isActive: true 
    })
      .populate('category', 'name')
      .populate('createdBy', 'name')
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
router.post('/:id/view', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid product id' });
  }
  try {
    const product = await Product.findById(req.params.id);
    
    if (product) {
      product.views += 1;
      await product.save();
      res.json({ message: 'View recorded', views: product.views });
    } else {
      res.status(404).json({ message: 'Product not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get product reviews specifically
router.get('/:id/reviews', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid product id' });
  }
  try {
    const product = await Product.findById(req.params.id)
      .populate('reviews.user', 'name email')
      .select('reviews averageRating');

    if (product) {
      res.json({
        reviews: product.reviews,
        averageRating: product.averageRating,
        totalReviews: product.reviews.length
      });
    } else {
      res.status(404).json({ message: 'Product not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update review endpoint to handle title field
router.post('/:id/reviews', protect, async (req, res) => {
  try {
    const { rating, comment, title } = req.body; // Add title here
    const product = await Product.findById(req.params.id);

    if (product) {
      const alreadyReviewed = product.reviews.find(
        review => review.user.toString() === req.user._id.toString()
      );

      if (alreadyReviewed) {
        return res.status(400).json({ message: 'Product already reviewed' });
      }

      const review = {
        user: req.user._id,
        rating: Number(rating),
        comment,
        title: title || '' // Handle optional title
      };

      product.reviews.push(review);
      await product.save();

      // Populate the new review with user data before sending response
      await product.populate('reviews.user', 'name');
      const newReview = product.reviews[product.reviews.length - 1];

      res.status(201).json({ 
        message: 'Review added successfully',
        review: newReview 
      });
    } else {
      res.status(404).json({ message: 'Product not found' });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;