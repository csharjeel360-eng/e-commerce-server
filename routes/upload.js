// routes/uploads.js
const express = require('express');
const { protect, admin } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { deleteFromCloudinary } = require('../middleware/uploadUtils');
const router = express.Router();

// Upload single image
router.post('/image', protect, admin, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    console.log('📁 File uploaded:', {
      originalname: req.file.originalname,
      filename: req.file.filename,
      path: req.file.path,
      size: req.file.size
    });

    res.json({
      success: true,
      message: 'Image uploaded successfully',
      data: {
        url: req.file.path,
        public_id: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size
      }
    });
  } catch (error) {
    console.error('❌ Upload error:', error);
    
    if (req.file && req.file.filename) {
      await deleteFromCloudinary(req.file.filename);
    }
    
    res.status(500).json({
      success: false,
      message: 'Image upload failed',
      error: error.message
    });
  }
});

// Upload multiple images
router.post('/images', protect, admin, upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No image files provided'
      });
    }

    console.log(`📁 ${req.files.length} files uploaded`);

    const uploadedImages = req.files.map(file => ({
      url: file.path,
      public_id: file.filename,
      originalName: file.originalname,
      size: file.size
    }));

    res.json({
      success: true,
      message: `${req.files.length} images uploaded successfully`,
      data: uploadedImages
    });
  } catch (error) {
    console.error('❌ Upload error:', error);
    
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await deleteFromCloudinary(file.filename);
      }
    }
    
    res.status(500).json({
      success: false,
      message: 'Images upload failed',
      error: error.message
    });
  }
});

// Delete image - accepts publicId via query parameter
// Expected format: DELETE /api/uploads/image?publicId=folder/filename
router.delete('/image', protect, admin, async (req, res) => {
  try {
    const { publicId } = req.query;
    
    console.log('📡 DELETE /image request received');
    console.log('   Headers:', req.headers);
    console.log('   Query:', req.query);
    console.log('   User:', req.user);
    
    if (!publicId) {
      return res.status(400).json({
        success: false,
        message: 'Public ID is required'
      });
    }

    console.log('🗑️ Backend - Deleting from Cloudinary:', publicId);
    
    // Decode the publicId in case it's URL encoded
    const decodedPublicId = decodeURIComponent(publicId);
    
    const result = await deleteFromCloudinary(decodedPublicId);
    
    res.json({
      success: true,
      message: 'Image deleted successfully',
      data: result
    });
  } catch (error) {
    console.error('❌ Backend - Delete error:', error);
    
    if (error.message.includes('not found') || error.http_code === 404) {
      return res.status(404).json({
        success: false,
        message: 'Image not found',
        error: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Deletion failed',
      error: error.message
    });
  }
});

// Test route
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Uploads route is working!',
    availableEndpoints: [
      'POST /api/uploads/image',
      'POST /api/uploads/images', 
      'DELETE /api/uploads/image?publicId=folder/filename'
    ]
  });
});

// Catch-all DELETE route for debugging
router.delete('*', (req, res) => {
  console.log('❌ Unmatched DELETE request:', {
    path: req.path,
    url: req.url,
    originalUrl: req.originalUrl,
    query: req.query
  });
  res.status(404).json({
    success: false,
    message: 'DELETE route not found',
    path: req.path,
    url: req.url,
    availableEndpoints: [
      'DELETE /image?publicId=folder/filename'
    ]
  });
});

module.exports = router;