// middleware/upload.js - FIXED VERSION
// Prevent duplicate loading with singleton pattern
if (!global.uploadMiddlewareInstance) {
  // Move all requires inside the singleton check
  const multer = require('multer');
  const cloudinary = require('../config/cloudinary');
  const { Readable } = require('stream');

  console.log('🔄 Initializing upload middleware...');

  let multerInstance = null;
  let adapterAvailable = false;

  // Try to use multer-storage-cloudinary if available
  try {
    const multerStorageCloudinary = require('multer-storage-cloudinary');
    const CloudinaryStorage = multerStorageCloudinary.CloudinaryStorage || multerStorageCloudinary.default || multerStorageCloudinary;
    
    if (typeof CloudinaryStorage === 'function') {
      const storage = new CloudinaryStorage({
        cloudinary: cloudinary,
        params: {
          folder: 'ecommerce',
          format: async () => 'webp',
          public_id: () => `image-${Date.now()}-${Math.round(Math.random() * 1e9)}`
        }
      });

      const fileFilter = (req, file, cb) => {
        if (file.mimetype && file.mimetype.startsWith('image/')) {
          cb(null, true);
        } else {
          cb(new Error('Only image files are allowed'), false);
        }
      };

      multerInstance = multer({ 
        storage, 
        fileFilter, 
        limits: { fileSize: 10 * 1024 * 1024 } 
      });
      adapterAvailable = true;
      console.log('✅ Using multer-storage-cloudinary adapter');
    }
  } catch (e) {
    console.log('ℹ️ multer-storage-cloudinary not available, using fallback');
  }

  // Fallback: memory storage + direct Cloudinary upload
  if (!multerInstance) {
    const storage = multer.memoryStorage();
    
    const fileFilter = (req, file, cb) => {
      if (file.mimetype && file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed'), false);
      }
    };

    multerInstance = multer({ 
      storage, 
      fileFilter, 
      limits: { fileSize: 10 * 1024 * 1024 } 
    });

    console.log('✅ Using memory storage + Cloudinary fallback');
  }

  // Cloudinary upload function for fallback
  async function uploadToCloudinaryBuffer(buffer, options = {}) {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
        if (error) {
          console.error('❌ Cloudinary upload error:', error);
          reject(error);
        } else {
          resolve(result);
        }
      });
      
      const readableStream = new Readable();
      readableStream._read = () => {};
      readableStream.push(buffer);
      readableStream.push(null);
      readableStream.pipe(uploadStream);
    });
  }

  // Create middleware functions based on adapter availability
  if (adapterAvailable) {
    // Using multer-storage-cloudinary adapter
    global.uploadMiddlewareInstance = {
      single: (fieldName) => multerInstance.single(fieldName),
      array: (fieldName, maxCount = 10) => multerInstance.array(fieldName, maxCount),
      fields: (fieldsArray) => multerInstance.fields(fieldsArray),
      multer: multerInstance,
      test: () => (req, res) => {
        res.json({
          success: true,
          message: 'Upload middleware is working (Cloudinary adapter)',
          timestamp: new Date().toISOString()
        });
      }
    };
  } else {
    // Using fallback with custom upload logic
    const originalSingle = multerInstance.single.bind(multerInstance);
    const originalArray = multerInstance.array.bind(multerInstance);
    const originalFields = multerInstance.fields.bind(multerInstance);

    global.uploadMiddlewareInstance = {
      single: (fieldName) => {
        return (req, res, next) => {
          console.log(`📤 Upload single: ${fieldName}`);
          originalSingle(fieldName)(req, res, async (err) => {
            if (err) return next(err);
            if (!req.file) return next();
            
            try {
              const publicId = `image-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
              const result = await uploadToCloudinaryBuffer(req.file.buffer, { 
                folder: 'ecommerce', 
                public_id: publicId, 
                transformation: [{ format: 'webp' }] 
              });
              
              req.file.path = result.secure_url || result.url;
              req.file.filename = result.public_id;
              req.file.size = result.bytes || req.file.size;
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

      array: (fieldName, maxCount = 10) => {
        return (req, res, next) => {
          console.log(`📤 Upload array: ${fieldName}, max: ${maxCount}`);
          originalArray(fieldName, maxCount)(req, res, async (err) => {
            if (err) return next(err);
            if (!req.files || req.files.length === 0) return next();
            
            try {
              const uploadedFiles = await Promise.all(
                req.files.map(async (file) => {
                  const publicId = `image-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
                  const result = await uploadToCloudinaryBuffer(file.buffer, { 
                    folder: 'ecommerce', 
                    public_id: publicId, 
                    transformation: [{ format: 'webp' }] 
                  });
                  
                  return {
                    originalname: file.originalname,
                    filename: result.public_id,
                    path: result.secure_url || result.url,
                    size: result.bytes || file.size,
                    cloudinary: result
                  };
                })
              );
              
              req.files = uploadedFiles;
              console.log(`✅ ${req.files.length} files uploaded to Cloudinary`);
              next();
            } catch (uploadError) {
              console.error('❌ Cloudinary upload failed:', uploadError);
              next(uploadError);
            }
          });
        };
      },

      fields: (fieldsArray) => {
        return (req, res, next) => {
          console.log(`📤 Upload fields:`, fieldsArray);
          originalFields(fieldsArray)(req, res, async (err) => {
            if (err) return next(err);
            if (!req.files || Object.keys(req.files).length === 0) return next();
            
            try {
              const fieldNames = Object.keys(req.files);
              const uploadedPerField = {};
              
              for (const field of fieldNames) {
                const files = req.files[field];
                const uploadedFiles = await Promise.all(
                  files.map(async (file) => {
                    const publicId = `image-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
                    const result = await uploadToCloudinaryBuffer(file.buffer, { 
                      folder: 'ecommerce', 
                      public_id: publicId, 
                      transformation: [{ format: 'webp' }] 
                    });
                    
                    return {
                      originalname: file.originalname,
                      filename: result.public_id,
                      path: result.secure_url || result.url,
                      size: result.bytes || file.size,
                      cloudinary: result
                    };
                  })
                );
                uploadedPerField[field] = uploadedFiles;
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

      multer: multerInstance,
      
      test: () => (req, res) => {
        res.json({
          success: true,
          message: 'Upload middleware is working (Memory storage fallback)',
          timestamp: new Date().toISOString()
        });
      }
    };
  }
}

// Export the singleton instance FIX IT
module.exports = global.uploadMiddlewareInstance;