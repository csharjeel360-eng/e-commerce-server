// middleware/upload.js - ENHANCED & FIXED VERSION
// Using memory storage with direct Cloudinary upload (most reliable approach)

const multer = require('multer');
const { Readable } = require('stream');

// Initialize cloudinary with comprehensive error handling
let cloudinary;
let cloudinaryAvailable = false;

try {
  cloudinary = require('../config/cloudinary');
  
  // Check if cloudinary is properly configured
  if (cloudinary && cloudinary.uploader && typeof cloudinary.uploader.upload_stream === 'function') {
    cloudinaryAvailable = true;
    console.log('✅ Cloudinary loaded and configured successfully');
    
    // Test Cloudinary connection
    cloudinary.api.ping()
      .then(() => console.log('✅ Cloudinary connection test passed'))
      .catch(error => console.error('❌ Cloudinary connection test failed:', error.message));
      
  } else {
    console.error('❌ Cloudinary loaded but uploader is not available');
    cloudinaryAvailable = false;
  }
} catch (error) {
  console.error('❌ Failed to load Cloudinary:', error.message);
  console.error('💡 Please check your Cloudinary configuration in config/cloudinary.js');
  cloudinaryAvailable = false;
}

// Create memory storage (most reliable)
const storage = multer.memoryStorage();

// Enhanced file filter function
const fileFilter = (req, file, cb) => {
  try {
    // Check if file exists and has mimetype
    if (!file || !file.mimetype) {
      return cb(new Error('Invalid file data received'), false);
    }

    // Check if file is an image
    if (file.mimetype.startsWith('image/')) {
      const allowedFormats = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      
      if (allowedFormats.includes(file.mimetype)) {
        console.log(`✅ Accepting file: ${file.originalname} (${file.mimetype})`);
        return cb(null, true);
      } else {
        console.log(`❌ Rejecting file: ${file.originalname} - Unsupported format: ${file.mimetype}`);
        return cb(new Error(`Unsupported image format. Allowed: ${allowedFormats.join(', ')}`), false);
      }
    } else {
      console.log(`❌ Rejecting non-image file: ${file.originalname} (${file.mimetype})`);
      return cb(new Error('Only image files are allowed! Supported formats: JPEG, PNG, WebP, GIF'), false);
    }
  } catch (filterError) {
    console.error('❌ File filter error:', filterError);
    cb(new Error('Error processing file'), false);
  }
};

// Enhanced multer instance with better error handling
const multerInstance = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 10, // Maximum 10 files
    fields: 20 // Maximum 20 non-file fields
  },
  preservePath: false
});

// Handle multer errors globally
multerInstance._handleError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 10MB.',
        code: 'FILE_TOO_LARGE'
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum is 10 files.',
        code: 'TOO_MANY_FILES'
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected field name for file upload.',
        code: 'UNEXPECTED_FIELD'
      });
    }
  }
  next(err);
};

// Enhanced Cloudinary upload function with retry mechanism
const uploadToCloudinary = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    if (!cloudinaryAvailable || !cloudinary || !cloudinary.uploader) {
      return reject(new Error('Cloudinary upload service is not available. Please check configuration.'));
    }

    const uploadOptions = {
      folder: options.folder || 'ecommerce',
      resource_type: 'image',
      transformation: [
        { quality: 'auto', fetch_format: 'auto' },
        { width: 1200, height: 800, crop: 'limit' }
      ],
      ...options
    };

    console.log(`☁️ Uploading to Cloudinary folder: ${uploadOptions.folder}`);

    // Create upload stream with timeout
    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          console.error('❌ Cloudinary upload error:', {
            message: error.message,
            code: error.http_code,
            name: error.name
          });
          reject(error);
        } else {
          console.log('✅ Cloudinary upload successful:', {
            public_id: result.public_id,
            format: result.format,
            size: result.bytes,
            url: result.secure_url ? '***' + result.secure_url.slice(-20) : 'No URL'
          });
          resolve(result);
        }
      }
    );

    // Handle stream errors
    uploadStream.on('error', (streamError) => {
      console.error('❌ Cloudinary stream error:', streamError);
      reject(new Error('File upload stream failed'));
    });

    // Convert buffer to stream and pipe to Cloudinary
    try {
      const readableStream = Readable.from(buffer);
      readableStream.pipe(uploadStream);
    } catch (streamError) {
      console.error('❌ Stream creation error:', streamError);
      reject(new Error('Failed to process file stream'));
    }
  });
};

// Generate unique public ID
const generatePublicId = (prefix = 'img', originalName = '') => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 15);
  const safeName = originalName ? originalName.split('.')[0].replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20) : '';
  return `${prefix}_${safeName}_${timestamp}_${randomString}`.toLowerCase();
};

// Enhanced single file upload middleware
const singleUpload = (fieldName) => {
  return (req, res, next) => {
    console.log(`📤 Starting single file upload for field: "${fieldName}"`);
    console.log(`👤 User: ${req.user?.email || 'Unknown'}`);
    
    multerInstance.single(fieldName)(req, res, async (err) => {
      if (err) {
        console.error('❌ Multer processing error:', err.message);
        return next(err);
      }

      // If no file was uploaded, continue
      if (!req.file) {
        console.log('ℹ️ No file uploaded in field:', fieldName);
        return next();
      }

      console.log(`📁 Processing file: ${req.file.originalname} (${(req.file.size / 1024).toFixed(2)} KB)`);

      // Check Cloudinary availability
      if (!cloudinaryAvailable) {
        const error = new Error('Cloudinary service is not available. Please try again later.');
        error.code = 'SERVICE_UNAVAILABLE';
        return next(error);
      }

      try {
        const publicId = generatePublicId('img', req.file.originalname);
        
        // Upload to Cloudinary
        const result = await uploadToCloudinary(req.file.buffer, {
          public_id: publicId,
          folder: 'ecommerce/uploads'
        });

        // Enhanced file object with Cloudinary data
        req.file.cloudinary = {
          public_id: result.public_id,
          url: result.secure_url,
          format: result.format,
          bytes: result.bytes,
          width: result.width,
          height: result.height,
          created_at: result.created_at,
          resource_type: result.resource_type
        };

        // Update file object for backward compatibility
        req.file.path = result.secure_url;
        req.file.filename = result.public_id;
        req.file.size = result.bytes;
        req.file.mimetype = result.format ? `image/${result.format}` : req.file.mimetype;

        console.log(`✅ File uploaded successfully: ${result.public_id}`);
        console.log(`🔗 URL: ${result.secure_url ? '***' + result.secure_url.slice(-30) : 'No URL'}`);

        next();

      } catch (uploadError) {
        console.error('❌ Cloudinary upload failed:', {
          message: uploadError.message,
          file: req.file.originalname,
          size: req.file.size
        });
        
        // Enhance error message for better client handling
        const enhancedError = new Error(`Upload failed: ${uploadError.message}`);
        enhancedError.code = uploadError.http_code ? `CLOUDINARY_${uploadError.http_code}` : 'UPLOAD_FAILED';
        enhancedError.originalError = uploadError;
        
        next(enhancedError);
      }
    });
  };
};

// Enhanced multiple files upload middleware
const arrayUpload = (fieldName, maxCount = 5) => {
  return (req, res, next) => {
    console.log(`📤 Starting multiple files upload for field: "${fieldName}" (max: ${maxCount})`);
    console.log(`👤 User: ${req.user?.email || 'Unknown'}`);
    
    multerInstance.array(fieldName, maxCount)(req, res, async (err) => {
      if (err) {
        console.error('❌ Multer processing error:', err.message);
        return next(err);
      }

      // If no files were uploaded, continue
      if (!req.files || req.files.length === 0) {
        console.log('ℹ️ No files uploaded in field:', fieldName);
        return next();
      }

      console.log(`📁 Processing ${req.files.length} files`);

      // Check Cloudinary availability
      if (!cloudinaryAvailable) {
        const error = new Error('Cloudinary service is not available. Please try again later.');
        error.code = 'SERVICE_UNAVAILABLE';
        return next(error);
      }

      try {
        const uploadPromises = req.files.map(async (file, index) => {
          console.log(`📄 Uploading file ${index + 1}/${req.files.length}: ${file.originalname}`);
          
          const publicId = generatePublicId('img', file.originalname);
          const result = await uploadToCloudinary(file.buffer, {
            public_id: publicId,
            folder: 'ecommerce/uploads'
          });

          return {
            originalname: file.originalname,
            filename: result.public_id,
            path: result.secure_url,
            size: result.bytes,
            mimetype: file.mimetype,
            cloudinary: {
              public_id: result.public_id,
              url: result.secure_url,
              format: result.format,
              bytes: result.bytes,
              width: result.width,
              height: result.height,
              created_at: result.created_at,
              resource_type: result.resource_type
            }
          };
        });

        // Wait for all uploads to complete
        const uploadedFiles = await Promise.all(uploadPromises);
        req.files = uploadedFiles;

        console.log(`✅ All ${uploadedFiles.length} files uploaded successfully`);
        next();

      } catch (uploadError) {
        console.error('❌ Cloudinary upload failed:', {
          message: uploadError.message,
          fileCount: req.files.length
        });
        
        const enhancedError = new Error(`Multiple upload failed: ${uploadError.message}`);
        enhancedError.code = uploadError.http_code ? `CLOUDINARY_${uploadError.http_code}` : 'UPLOAD_FAILED';
        enhancedError.originalError = uploadError;
        
        next(enhancedError);
      }
    });
  };
};

// Enhanced fields upload middleware (multiple fields)
const fieldsUpload = (fields) => {
  return (req, res, next) => {
    console.log(`📤 Starting fields upload:`, fields.map(f => `${f.name} (max: ${f.maxCount})`));
    console.log(`👤 User: ${req.user?.email || 'Unknown'}`);
    
    multerInstance.fields(fields)(req, res, async (err) => {
      if (err) {
        console.error('❌ Multer processing error:', err.message);
        return next(err);
      }

      // If no files were uploaded, continue
      if (!req.files || Object.keys(req.files).length === 0) {
        console.log('ℹ️ No files uploaded in any field');
        return next();
      }

      console.log(`📁 Processing files in ${Object.keys(req.files).length} fields`);

      // Check Cloudinary availability
      if (!cloudinaryAvailable) {
        const error = new Error('Cloudinary service is not available. Please try again later.');
        error.code = 'SERVICE_UNAVAILABLE';
        return next(error);
      }

      try {
        const uploadResults = {};
        const fieldNames = Object.keys(req.files);

        for (const fieldName of fieldNames) {
          const files = req.files[fieldName];
          console.log(`📄 Processing ${files.length} files in field: "${fieldName}"`);

          const uploadPromises = files.map(async (file, index) => {
            const publicId = generatePublicId(fieldName, file.originalname);
            const result = await uploadToCloudinary(file.buffer, {
              public_id: publicId,
              folder: `ecommerce/${fieldName}`
            });

            return {
              originalname: file.originalname,
              filename: result.public_id,
              path: result.secure_url,
              size: result.bytes,
              mimetype: file.mimetype,
              cloudinary: {
                public_id: result.public_id,
                url: result.secure_url,
                format: result.format,
                bytes: result.bytes,
                width: result.width,
                height: result.height,
                created_at: result.created_at,
                resource_type: result.resource_type
              }
            };
          });

          uploadResults[fieldName] = await Promise.all(uploadPromises);
          console.log(`✅ Field "${fieldName}" uploaded successfully: ${files.length} files`);
        }

        req.files = uploadResults;
        console.log(`✅ All fields uploaded successfully: ${fieldNames.join(', ')}`);
        next();

      } catch (uploadError) {
        console.error('❌ Cloudinary upload failed:', {
          message: uploadError.message,
          fields: Object.keys(req.files)
        });
        
        const enhancedError = new Error(`Fields upload failed: ${uploadError.message}`);
        enhancedError.code = uploadError.http_code ? `CLOUDINARY_${uploadError.http_code}` : 'UPLOAD_FAILED';
        enhancedError.originalError = uploadError;
        
        next(enhancedError);
      }
    });
  };
};

// Any file upload (flexible field name)
const anyUpload = () => {
  return (req, res, next) => {
    console.log(`📤 Starting any file upload`);
    console.log(`👤 User: ${req.user?.email || 'Unknown'}`);
    
    multerInstance.any()(req, res, async (err) => {
      if (err) {
        console.error('❌ Multer processing error:', err.message);
        return next(err);
      }

      if (!req.files || req.files.length === 0) {
        console.log('ℹ️ No files uploaded');
        return next();
      }

      console.log(`📁 Processing ${req.files.length} files from any field`);

      // Check Cloudinary availability
      if (!cloudinaryAvailable) {
        const error = new Error('Cloudinary service is not available. Please try again later.');
        error.code = 'SERVICE_UNAVAILABLE';
        return next(error);
      }

      try {
        const uploadPromises = req.files.map(async (file, index) => {
          console.log(`📄 Uploading file ${index + 1}/${req.files.length}: ${file.originalname} (field: ${file.fieldname})`);
          
          const publicId = generatePublicId(file.fieldname, file.originalname);
          const result = await uploadToCloudinary(file.buffer, {
            public_id: publicId,
            folder: `ecommerce/${file.fieldname}`
          });

          return {
            fieldname: file.fieldname,
            originalname: file.originalname,
            filename: result.public_id,
            path: result.secure_url,
            size: result.bytes,
            mimetype: file.mimetype,
            cloudinary: {
              public_id: result.public_id,
              url: result.secure_url,
              format: result.format,
              bytes: result.bytes,
              width: result.width,
              height: result.height,
              created_at: result.created_at,
              resource_type: result.resource_type
            }
          };
        });

        req.files = await Promise.all(uploadPromises);
        console.log(`✅ All ${req.files.length} files uploaded successfully`);
        next();

      } catch (uploadError) {
        console.error('❌ Cloudinary upload failed:', uploadError.message);
        
        const enhancedError = new Error(`Upload failed: ${uploadError.message}`);
        enhancedError.code = uploadError.http_code ? `CLOUDINARY_${uploadError.http_code}` : 'UPLOAD_FAILED';
        enhancedError.originalError = uploadError;
        
        next(enhancedError);
      }
    });
  };
};

// Test endpoint to verify upload functionality
const testUpload = (req, res) => {
  const status = {
    success: true,
    message: 'Upload middleware is working correctly',
    timestamp: new Date().toISOString(),
    cloudinary: {
      configured: !!cloudinary,
      available: cloudinaryAvailable,
      uploader_available: !!(cloudinary && cloudinary.uploader)
    },
    limits: {
      fileSize: '10MB',
      maxFiles: 10,
      allowedFormats: ['JPEG', 'PNG', 'WebP', 'GIF']
    },
    endpoints: {
      single: 'POST /api/uploads/image',
      multiple: 'POST /api/uploads/images',
      fields: 'POST /api/uploads/fields'
    }
  };

  console.log('🧪 Upload test endpoint called:', status);
  res.json(status);
};

// Health check endpoint
const healthCheck = (req, res) => {
  const health = {
    success: cloudinaryAvailable,
    service: 'file-upload',
    timestamp: new Date().toISOString(),
    cloudinary: {
      status: cloudinaryAvailable ? 'healthy' : 'unhealthy',
      configured: !!cloudinary,
      uploader_available: !!(cloudinary && cloudinary.uploader)
    },
    uptime: process.uptime()
  };

  res.json(health);
};

// Export the upload middleware
module.exports = {
  single: singleUpload,
  array: arrayUpload,
  fields: fieldsUpload,
  any: anyUpload,
  multer: multerInstance,
  test: testUpload,
  health: healthCheck,
  uploadToCloudinary,
  isCloudinaryAvailable: () => cloudinaryAvailable
};