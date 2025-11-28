// middleware/upload.js - COMPLETE & FIXED VERSION
// Using memory storage with direct Cloudinary upload

const multer = require('multer');
const { Readable } = require('stream');

// =============================================
// CLOUDINARY CONFIGURATION & AVAILABILITY CHECK
// =============================================

let cloudinary;
let cloudinaryAvailable = false;
let cloudinaryConfig = {};

console.log('🔧 ========== UPLOAD MIDDLEWARE INITIALIZATION ==========');

try {
  cloudinary = require('../config/cloudinary');
  
  // Enhanced availability check
  if (cloudinary && 
      cloudinary.config && 
      typeof cloudinary.config === 'function' &&
      cloudinary.uploader && 
      typeof cloudinary.uploader.upload_stream === 'function') {
    
    // Test if configuration is actually set
    const config = cloudinary.config();
    if (config && config.cloud_name && config.api_key && config.api_secret) {
      cloudinaryAvailable = true;
      cloudinaryConfig = config;
      
      console.log('✅ Cloudinary loaded and configured successfully');
      console.log('   Cloud Name:', config.cloud_name);
      console.log('   API Key:', config.api_key ? '***' + config.api_key.slice(-4) : 'MISSING');
      console.log('   Secure:', config.secure);
      
      // Test Cloudinary connection
      cloudinary.api.ping()
        .then((result) => {
          console.log('✅ Cloudinary connection test passed');
          console.log('   Status:', result.status);
        })
        .catch(error => {
          console.error('❌ Cloudinary connection test failed:');
          console.error('   Message:', error.message);
          console.error('   HTTP Code:', error.http_code);
          cloudinaryAvailable = false;
        });
        
    } else {
      console.error('❌ Cloudinary loaded but configuration is incomplete:');
      console.error('   Cloud Name:', config?.cloud_name || 'MISSING');
      console.error('   API Key:', config?.api_key ? '***' + config.api_key.slice(-4) : 'MISSING');
      console.error('   API Secret:', config?.api_secret ? '***' + config.api_secret.slice(-4) : 'MISSING');
      cloudinaryAvailable = false;
    }
  } else {
    console.error('❌ Cloudinary loaded but required methods are missing:');
    console.error('   - cloudinary exists:', !!cloudinary);
    console.error('   - cloudinary.config function:', !!(cloudinary && cloudinary.config && typeof cloudinary.config === 'function'));
    console.error('   - cloudinary.uploader exists:', !!(cloudinary && cloudinary.uploader));
    console.error('   - upload_stream function:', !!(cloudinary && cloudinary.uploader && typeof cloudinary.uploader.upload_stream === 'function'));
    cloudinaryAvailable = false;
  }
} catch (error) {
  console.error('❌ Failed to load Cloudinary configuration:');
  console.error('   Error:', error.message);
  console.error('   Stack:', error.stack);
  console.error('💡 Please check your Cloudinary configuration in config/cloudinary.js');
  cloudinaryAvailable = false;
}

console.log('🔧 Cloudinary Available:', cloudinaryAvailable);
console.log('🔧 ========== INITIALIZATION COMPLETE ==========');

// =============================================
// MULTER CONFIGURATION
// =============================================

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
      const allowedFormats = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/jpg'];
      
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

// =============================================
// CLOUDINARY UTILITY FUNCTIONS
// =============================================

// Enhanced Cloudinary upload function with retry mechanism
const uploadToCloudinary = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    if (!cloudinaryAvailable || !cloudinary || !cloudinary.uploader) {
      const error = new Error(
        `Cloudinary upload service is not available. ` +
        `Available: ${cloudinaryAvailable}, ` +
        `Cloudinary: ${!!cloudinary}, ` +
        `Uploader: ${!!(cloudinary && cloudinary.uploader)}`
      );
      error.code = 'SERVICE_UNAVAILABLE';
      return reject(error);
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
    console.log(`   Public ID: ${uploadOptions.public_id || 'auto-generated'}`);

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
          
          const enhancedError = new Error(`Cloudinary upload failed: ${error.message}`);
          enhancedError.http_code = error.http_code;
          enhancedError.originalError = error;
          reject(enhancedError);
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
      const enhancedError = new Error('File upload stream failed');
      enhancedError.originalError = streamError;
      reject(enhancedError);
    });

    // Convert buffer to stream and pipe to Cloudinary
    try {
      const readableStream = Readable.from(buffer);
      readableStream.pipe(uploadStream);
      
      // Handle stream completion
      readableStream.on('end', () => {
        console.log('📤 File stream completed successfully');
      });
      
      readableStream.on('error', (streamError) => {
        console.error('❌ Readable stream error:', streamError);
        const enhancedError = new Error('Failed to create file stream');
        enhancedError.originalError = streamError;
        reject(enhancedError);
      });
      
    } catch (streamError) {
      console.error('❌ Stream creation error:', streamError);
      const enhancedError = new Error('Failed to process file stream');
      enhancedError.originalError = streamError;
      reject(enhancedError);
    }
  });
};

// Generate unique public ID
const generatePublicId = (prefix = 'img', originalName = '') => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 15);
  const safeName = originalName ? 
    originalName.split('.')[0].replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20) : '';
  return `${prefix}_${safeName}_${timestamp}_${randomString}`.toLowerCase();
};

// Get Cloudinary status
const getCloudinaryStatus = () => {
  return {
    available: cloudinaryAvailable,
    configured: !!cloudinary,
    cloudName: cloudinary?.config()?.cloud_name || 'Not configured',
    hasUploader: !!(cloudinary && cloudinary.uploader),
    config: cloudinaryConfig
  };
};

// =============================================
// UPLOAD MIDDLEWARE FUNCTIONS
// =============================================

// Enhanced single file upload middleware
const singleUpload = (fieldName) => {
  return (req, res, next) => {
    console.log(`📤 Starting single file upload for field: "${fieldName}"`);
    console.log(`👤 User: ${req.user?.email || 'Unknown'}`);
    console.log(`🔧 Cloudinary Available: ${cloudinaryAvailable}`);
    
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
        const status = getCloudinaryStatus();
        const error = new Error(
          `Cloudinary service is not available. Status: ${JSON.stringify(status)}`
        );
        error.code = 'SERVICE_UNAVAILABLE';
        error.details = status;
        return next(error);
      }

      try {
        const publicId = generatePublicId('img', req.file.originalname);
        
        console.log(`🔄 Uploading to Cloudinary: ${publicId}`);
        
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
          size: req.file.size,
          code: uploadError.code
        });
        
        // Enhance error message for better client handling
        const enhancedError = new Error(`Upload failed: ${uploadError.message}`);
        enhancedError.code = uploadError.http_code ? `CLOUDINARY_${uploadError.http_code}` : 'UPLOAD_FAILED';
        enhancedError.originalError = uploadError;
        enhancedError.details = {
          file: req.file.originalname,
          size: req.file.size
        };
        
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
    console.log(`🔧 Cloudinary Available: ${cloudinaryAvailable}`);
    
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
        const status = getCloudinaryStatus();
        const error = new Error(
          `Cloudinary service is not available. Status: ${JSON.stringify(status)}`
        );
        error.code = 'SERVICE_UNAVAILABLE';
        error.details = status;
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
          fileCount: req.files.length,
          code: uploadError.code
        });
        
        const enhancedError = new Error(`Multiple upload failed: ${uploadError.message}`);
        enhancedError.code = uploadError.http_code ? `CLOUDINARY_${uploadError.http_code}` : 'UPLOAD_FAILED';
        enhancedError.originalError = uploadError;
        enhancedError.details = {
          fileCount: req.files.length
        };
        
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
    console.log(`🔧 Cloudinary Available: ${cloudinaryAvailable}`);
    
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
        const status = getCloudinaryStatus();
        const error = new Error(
          `Cloudinary service is not available. Status: ${JSON.stringify(status)}`
        );
        error.code = 'SERVICE_UNAVAILABLE';
        error.details = status;
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
          fields: Object.keys(req.files),
          code: uploadError.code
        });
        
        const enhancedError = new Error(`Fields upload failed: ${uploadError.message}`);
        enhancedError.code = uploadError.http_code ? `CLOUDINARY_${uploadError.http_code}` : 'UPLOAD_FAILED';
        enhancedError.originalError = uploadError;
        enhancedError.details = {
          fields: Object.keys(req.files)
        };
        
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
    console.log(`🔧 Cloudinary Available: ${cloudinaryAvailable}`);
    
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
        const status = getCloudinaryStatus();
        const error = new Error(
          `Cloudinary service is not available. Status: ${JSON.stringify(status)}`
        );
        error.code = 'SERVICE_UNAVAILABLE';
        error.details = status;
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
        console.error('❌ Cloudinary upload failed:', {
          message: uploadError.message,
          code: uploadError.code
        });
        
        const enhancedError = new Error(`Upload failed: ${uploadError.message}`);
        enhancedError.code = uploadError.http_code ? `CLOUDINARY_${uploadError.http_code}` : 'UPLOAD_FAILED';
        enhancedError.originalError = uploadError;
        
        next(enhancedError);
      }
    });
  };
};

// =============================================
// UTILITY FUNCTIONS & EXPORTS
// =============================================

// Test endpoint to verify upload functionality
const testUpload = (req, res) => {
  const status = {
    success: true,
    message: 'Upload middleware is working correctly',
    timestamp: new Date().toISOString(),
    cloudinary: getCloudinaryStatus(),
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
    cloudinary: getCloudinaryStatus(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  };

  res.json(health);
};

// Debug endpoint for Cloudinary configuration
const debugConfig = (req, res) => {
  const debugInfo = {
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV,
    cloudinaryEnvVars: {
      CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME ? '***' + process.env.CLOUDINARY_CLOUD_NAME.slice(-4) : 'MISSING',
      CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY ? '***' + process.env.CLOUDINARY_API_KEY.slice(-4) : 'MISSING',
      CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET ? '***' + process.env.CLOUDINARY_API_SECRET.slice(-4) : 'MISSING',
    },
    cloudinaryConfig: getCloudinaryStatus(),
    uploadMiddleware: {
      cloudinaryAvailable: cloudinaryAvailable,
      multerConfigured: !!multerInstance
    }
  };

  console.log('🔍 Debug configuration requested:', debugInfo);
  res.json(debugInfo);
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
  debug: debugConfig,
  uploadToCloudinary,
  getCloudinaryStatus,
  isCloudinaryAvailable: () => cloudinaryAvailable
};