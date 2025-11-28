const express = require('express');
const { protect, admin } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { deleteFromCloudinary } = require('../middleware/uploadUtils');
const router = express.Router();

// Upload single image
router.post('/image', protect, admin, upload.single('image'), async (req, res) => {
  try {
    console.log('📤 POST /image - Upload request received');
    console.log('   Headers:', req.headers['content-type']);
    console.log('   User:', req.user?.email);

    if (!req.file) {
      console.log('❌ No file in request');
      return res.status(400).json({
        success: false,
        message: 'No image file provided. Please select an image to upload.',
        code: 'NO_FILE_PROVIDED'
      });
    }

    // Validate file
    if (!req.file.path || !req.file.filename) {
      console.log('❌ Invalid file data:', req.file);
      return res.status(400).json({
        success: false,
        message: 'Invalid file data received',
        code: 'INVALID_FILE_DATA'
      });
    }

    console.log('✅ File uploaded successfully:', {
      originalname: req.file.originalname,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype
    });

    const responseData = {
      url: req.file.path,
      public_id: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      timestamp: new Date().toISOString()
    };

    // Include Cloudinary details if available
    if (req.file.cloudinary) {
      responseData.cloudinary = {
        format: req.file.cloudinary.format,
        width: req.file.cloudinary.width,
        height: req.file.cloudinary.height,
        bytes: req.file.cloudinary.bytes
      };
    }

    res.json({
      success: true,
      message: 'Image uploaded successfully',
      data: responseData
    });

  } catch (error) {
    console.error('❌ Upload error:', error);
    
    // Clean up uploaded file if there's an error
    if (req.file && req.file.filename) {
      try {
        console.log('🧹 Cleaning up uploaded file due to error:', req.file.filename);
        await deleteFromCloudinary(req.file.filename);
      } catch (deleteError) {
        console.error('❌ Cleanup failed:', deleteError);
      }
    }
    
    res.status(500).json({
      success: false,
      message: 'Image upload failed',
      error: error.message,
      code: 'UPLOAD_FAILED'
    });
  }
});

// Upload multiple images
router.post('/images', protect, admin, upload.array('images', 10), async (req, res) => {
  try {
    console.log('📤 POST /images - Multiple upload request received');
    console.log('   File count:', req.files?.length || 0);
    console.log('   User:', req.user?.email);

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No image files provided. Please select at least one image.',
        code: 'NO_FILES_PROVIDED'
      });
    }

    // Validate all files
    const invalidFiles = req.files.filter(file => !file.path || !file.filename);
    if (invalidFiles.length > 0) {
      console.log('❌ Invalid files found:', invalidFiles.length);
      return res.status(400).json({
        success: false,
        message: 'Some files contain invalid data',
        code: 'INVALID_FILES'
      });
    }

    console.log(`✅ ${req.files.length} files uploaded successfully`);

    const uploadedImages = req.files.map(file => {
      const imageData = {
        url: file.path,
        public_id: file.filename,
        originalName: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
        timestamp: new Date().toISOString()
      };

      // Include Cloudinary details if available
      if (file.cloudinary) {
        imageData.cloudinary = {
          format: file.cloudinary.format,
          width: file.cloudinary.width,
          height: file.cloudinary.height,
          bytes: file.cloudinary.bytes
        };
      }

      return imageData;
    });

    res.json({
      success: true,
      message: `${req.files.length} image${req.files.length > 1 ? 's' : ''} uploaded successfully`,
      data: uploadedImages,
      count: uploadedImages.length
    });

  } catch (error) {
    console.error('❌ Multiple upload error:', error);
    
    // Clean up all uploaded files if there's an error
    if (req.files && req.files.length > 0) {
      console.log(`🧹 Cleaning up ${req.files.length} files due to error`);
      const cleanupPromises = req.files.map(file => 
        deleteFromCloudinary(file.filename).catch(cleanupError => 
          console.error('Cleanup failed for:', file.filename, cleanupError)
        )
      );
      await Promise.allSettled(cleanupPromises);
    }
    
    res.status(500).json({
      success: false,
      message: 'Images upload failed',
      error: error.message,
      code: 'UPLOAD_FAILED'
    });
  }
});

// Upload for specific fields (banner, product, profile, etc.)
router.post('/fields', protect, admin, upload.fields([
  { name: 'banner', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 },
  { name: 'product', maxCount: 1 },
  { name: 'profile', maxCount: 1 },
  { name: 'gallery', maxCount: 10 }
]), async (req, res) => {
  try {
    console.log('📤 POST /fields - Field-based upload request received');
    console.log('   Fields with files:', req.files ? Object.keys(req.files) : 'none');
    console.log('   User:', req.user?.email);

    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files provided in any field',
        code: 'NO_FILES_PROVIDED'
      });
    }

    const result = {};
    let totalFiles = 0;

    Object.keys(req.files).forEach(fieldName => {
      const files = req.files[fieldName];
      totalFiles += files.length;

      result[fieldName] = files.map(file => {
        const fileData = {
          filename: file.filename,
          url: file.path,
          originalName: file.originalname,
          size: file.size,
          mimetype: file.mimetype,
          timestamp: new Date().toISOString()
        };

        // Include Cloudinary details if available
        if (file.cloudinary) {
          fileData.cloudinary = {
            public_id: file.cloudinary.public_id,
            format: file.cloudinary.format,
            width: file.cloudinary.width,
            height: file.cloudinary.height,
            bytes: file.cloudinary.bytes
          };
        }

        return fileData;
      });

      console.log(`✅ Field "${fieldName}": ${files.length} file(s) uploaded`);
    });

    res.json({
      success: true,
      message: `${totalFiles} file${totalFiles > 1 ? 's' : ''} uploaded across ${Object.keys(req.files).length} field${Object.keys(req.files).length > 1 ? 's' : ''}`,
      data: result,
      stats: {
        totalFiles,
        fields: Object.keys(req.files),
        fieldCount: Object.keys(req.files).length
      }
    });

  } catch (error) {
    console.error('❌ Field upload error:', error);
    
    // Clean up all uploaded files if there's an error
    if (req.files) {
      console.log('🧹 Cleaning up field uploads due to error');
      const cleanupPromises = [];
      
      Object.keys(req.files).forEach(fieldName => {
        req.files[fieldName].forEach(file => {
          cleanupPromises.push(
            deleteFromCloudinary(file.filename).catch(cleanupError =>
              console.error('Cleanup failed for:', file.filename, cleanupError)
            )
          );
        });
      });
      
      await Promise.allSettled(cleanupPromises);
    }
    
    res.status(500).json({
      success: false,
      message: 'Field-based upload failed',
      error: error.message,
      code: 'UPLOAD_FAILED'
    });
  }
});

// Delete image - accepts publicId via query parameter or body
router.delete('/image', protect, admin, async (req, res) => {
  try {
    const { publicId } = req.query || req.body;
    
    console.log('🗑️ DELETE /image request received');
    console.log('   Method:', req.method);
    console.log('   Query:', req.query);
    console.log('   Body:', req.body);
    console.log('   User:', req.user?.email);
    
    if (!publicId) {
      return res.status(400).json({
        success: false,
        message: 'Public ID is required. Provide it as query parameter: ?publicId=your_public_id',
        code: 'MISSING_PUBLIC_ID'
      });
    }

    // Validate publicId format
    if (typeof publicId !== 'string' || publicId.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Public ID format',
        code: 'INVALID_PUBLIC_ID'
      });
    }

    const decodedPublicId = decodeURIComponent(publicId.trim());
    console.log('🗑️ Deleting from Cloudinary:', decodedPublicId);
    
    const result = await deleteFromCloudinary(decodedPublicId);
    
    console.log('✅ Delete successful:', result);
    
    res.json({
      success: true,
      message: 'Image deleted successfully',
      data: result,
      deletedPublicId: decodedPublicId
    });

  } catch (error) {
    console.error('❌ Delete error:', error);
    
    // Handle specific Cloudinary errors
    if (error.message.includes('not found') || error.http_code === 404) {
      return res.status(404).json({
        success: false,
        message: 'Image not found in Cloudinary',
        error: error.message,
        code: 'IMAGE_NOT_FOUND'
      });
    }

    if (error.message.includes('Invalid') || error.http_code === 400) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Public ID provided',
        error: error.message,
        code: 'INVALID_PUBLIC_ID'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Image deletion failed',
      error: error.message,
      code: 'DELETE_FAILED'
    });
  }
});

// Bulk delete images
router.delete('/images', protect, admin, async (req, res) => {
  try {
    const { publicIds } = req.body;
    
    console.log('🗑️ DELETE /images - Bulk delete request');
    console.log('   Public IDs count:', publicIds?.length || 0);
    console.log('   User:', req.user?.email);

    if (!publicIds || !Array.isArray(publicIds) || publicIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Public IDs array is required in request body',
        code: 'MISSING_PUBLIC_IDS'
      });
    }

    if (publicIds.length > 50) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete more than 50 images at once',
        code: 'TOO_MANY_IMAGES'
      });
    }

    const deleteResults = await Promise.allSettled(
      publicIds.map(publicId => 
        deleteFromCloudinary(decodeURIComponent(publicId.trim()))
          .then(result => ({ publicId, status: 'fulfilled', result }))
          .catch(error => ({ publicId, status: 'rejected', error: error.message }))
      )
    );

    const successful = deleteResults.filter(r => r.status === 'fulfilled');
    const failed = deleteResults.filter(r => r.status === 'rejected');

    console.log(`✅ Bulk delete: ${successful.length} successful, ${failed.length} failed`);

    res.json({
      success: true,
      message: `Bulk delete completed: ${successful.length} successful, ${failed.length} failed`,
      data: {
        total: publicIds.length,
        successful: successful.length,
        failed: failed.length,
        details: {
          successful: successful.map(s => s.value),
          failed: failed.map(f => f.reason)
        }
      }
    });

  } catch (error) {
    console.error('❌ Bulk delete error:', error);
    res.status(500).json({
      success: false,
      message: 'Bulk delete failed',
      error: error.message,
      code: 'BULK_DELETE_FAILED'
    });
  }
});

// Get upload statistics and info
router.get('/info', protect, admin, (req, res) => {
  const info = {
    success: true,
    data: {
      service: 'Cloudinary File Upload Service',
      maxFileSize: '10MB',
      allowedFormats: ['JPEG', 'PNG', 'WebP', 'GIF'],
      maxFiles: {
        single: 1,
        multiple: 10,
        gallery: 10
      },
      features: [
        'Automatic image optimization',
        'WebP format conversion',
        'Quality auto-adjustment',
        'Secure deletion'
      ]
    }
  };

  res.json(info);
});

// Test route
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Uploads API is working! 🚀',
    timestamp: new Date().toISOString(),
    availableEndpoints: [
      'POST   /api/uploads/image - Upload single image',
      'POST   /api/uploads/images - Upload multiple images (max 10)',
      'POST   /api/uploads/fields - Upload to specific fields',
      'DELETE /api/uploads/image - Delete single image (?publicId=)',
      'DELETE /api/uploads/images - Bulk delete images',
      'GET    /api/uploads/info - Get upload service info',
      'GET    /api/uploads/test - This test endpoint'
    ],
    usage: {
      singleUpload: 'Send POST with form-data, field name: "image"',
      multipleUpload: 'Send POST with form-data, field name: "images"',
      delete: 'Send DELETE with query: ?publicId=your_public_id'
    }
  });
});

// Health check for upload service
router.get('/health', async (req, res) => {
  try {
    // Simple health check - you could add Cloudinary API test here
    res.json({
      success: true,
      status: 'healthy',
      service: 'upload',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      service: 'upload',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Catch-all route for debugging
router.all('*', (req, res) => {
  console.log('❌ Unmatched request to uploads:', {
    method: req.method,
    path: req.path,
    url: req.url,
    originalUrl: req.originalUrl,
    query: req.query
  });
  
  res.status(404).json({
    success: false,
    message: `Upload endpoint not found: ${req.method} ${req.path}`,
    availableEndpoints: [
      'POST /api/uploads/image',
      'POST /api/uploads/images',
      'POST /api/uploads/fields',
      'DELETE /api/uploads/image',
      'DELETE /api/uploads/images',
      'GET /api/uploads/info',
      'GET /api/uploads/test',
      'GET /api/uploads/health'
    ]
  });
});

module.exports = router;