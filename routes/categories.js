 const express = require('express');
const Category = require('../models/Category');
const { protect, admin } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { deleteFromCloudinary } = require('../middleware/uploadUtils');
const router = express.Router();

// Get all categories
router.get('/', async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create category (Admin only)
router.post('/', protect, admin, upload.single('image'), async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ message: 'Image is required' });
    }

    const category = new Category({
      name,
      description,
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

// Update category
router.put('/:id', protect, admin, upload.single('image'), async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    
    if (category) {
      const oldImagePublicId = category.image.public_id;
      
      category.name = req.body.name || category.name;
      category.description = req.body.description || category.description;
      
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

// Delete category
router.delete('/:id', protect, admin, async (req, res) => {
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