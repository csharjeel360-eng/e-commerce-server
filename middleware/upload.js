// middleware/upload.js - FIXED VERSION
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { Readable } = require('stream');

console.log('🔄 Upload middleware initialized');

// Basic memory storage
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype && file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

const baseMulter = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Cloudinary upload function
const uploadToCloudinaryBuffer = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream({
      folder: 'ecommerce',
      format: 'webp',
      ...options
    }, (error, result) => {
      if (error) {
        console.error('❌ Cloudinary upload error:', error);
        reject(error);
      } else {
        console.log('✅ Cloudinary upload success:', result.public_id);
        resolve(result);
      }
    });

    const readableStream = new Readable();
    readableStream._read = () => {};
    readableStream.push(buffer);
    readableStream.push(null);
    readableStream.pipe(uploadStream);
  });
};

// Enhanced middleware functions
const uploadMiddleware = {
  // Single file upload
  single: (fieldName) => {
    return (req, res, next) => {
      console.log(`📤 Upload single: ${fieldName}`);
      
      baseMulter.single(fieldName)(req, res, async (err) => {
        if (err) {
          console.error('❌ Multer error:', err);
          return next(err);
        }
        
        if (!req.file) {
          console.log('ℹ️ No file uploaded');
          return next();
        }

        console.log('📁 File received:', {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size
        });

        try {
          const publicId = `image-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          const result = await uploadToCloudinaryBuffer(req.file.buffer, {
            public_id: publicId
          });
          
          // Enhance the file object with Cloudinary info
          req.file.path = result.secure_url;
          req.file.filename = result.public_id;
          req.file.size = result.bytes;
          req.file.cloudinary = result;

          console.log('✅ File uploaded to Cloudinary:', req.file.path);
          next();
        } catch (uploadError) {
          console.error('❌ Cloudinary upload failed:', uploadError);
          next(uploadError);
        }
      });
    };
  },

  // Multiple files upload
  array: (fieldName, maxCount = 10) => {
    return (req, res, next) => {
      console.log(`📤 Upload array: ${fieldName}, max: ${maxCount}`);
      
      baseMulter.array(fieldName, maxCount)(req, res, async (err) => {
        if (err) {
          console.error('❌ Multer error:', err);
          return next(err);
        }
        
        if (!req.files || req.files.length === 0) {
          console.log('ℹ️ No files uploaded');
          return next();
        }

        console.log(`📁 ${req.files.length} files received`);

        try {
          const uploadPromises = req.files.map(async (file) => {
            const publicId = `image-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
            const result = await uploadToCloudinaryBuffer(file.buffer, {
              public_id: publicId
            });
            
            return {
              originalname: file.originalname,
              mimetype: file.mimetype,
              filename: result.public_id,
              path: result.secure_url,
              size: result.bytes,
              cloudinary: result
            };
          });

          req.files = await Promise.all(uploadPromises);
          console.log(`✅ ${req.files.length} files uploaded to Cloudinary`);
          next();
        } catch (uploadError) {
          console.error('❌ Cloudinary upload failed:', uploadError);
          next(uploadError);
        }
      });
    };
  },

  // Multiple fields upload
  fields: (fieldsArray) => {
    return (req, res, next) => {
      console.log(`📤 Upload fields:`, fieldsArray);
      
      baseMulter.fields(fieldsArray)(req, res, async (err) => {
        if (err) {
          console.error('❌ Multer error:', err);
          return next(err);
        }
        
        if (!req.files || Object.keys(req.files).length === 0) {
          console.log('ℹ️ No files uploaded');
          return next();
        }

        try {
          const fieldNames = Object.keys(req.files);
          const uploadedPerField = {};
          
          for (const field of fieldNames) {
            const files = req.files[field];
            console.log(`📁 Processing ${files.length} files for field: ${field}`);
            
            const uploadPromises = files.map(async (file) => {
              const publicId = `image-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
              const result = await uploadToCloudinaryBuffer(file.buffer, {
                public_id: publicId
              });
              
              return {
                originalname: file.originalname,
                mimetype: file.mimetype,
                filename: result.public_id,
                path: result.secure_url,
                size: result.bytes,
                cloudinary: result
              };
            });
            
            uploadedPerField[field] = await Promise.all(uploadPromises);
          }
          
          req.files = uploadedPerField;
          console.log(`✅ Files uploaded for fields: ${fieldNames.join(', ')}`);
          next();
        } catch (uploadError) {
          console.error('❌ Cloudinary upload failed:', uploadError);
          next(uploadError);
        }
      });
    };
  },

  // Expose the base multer instance for advanced usage
  multer: baseMulter,

  // Utility function to check if middleware is working
  test: () => {
    return (req, res) => {
      res.json({
        success: true,
        message: 'Upload middleware is working correctly',
        timestamp: new Date().toISOString()
      });
    };
  }
};

module.exports = uploadMiddleware;