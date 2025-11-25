const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { Readable } = require('stream');

// Initialize multer with memory storage as default
const storage = multer.memoryStorage();
const baseMulter = multer({ 
  storage, 
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Not an image! Please upload only images.'), false);
    }
  }
});

// Function to upload buffer to Cloudinary
async function uploadToCloudinaryBuffer(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    
    const readableStream = new Readable();
    readableStream._read = () => {};
    readableStream.push(buffer);
    readableStream.push(null);
    readableStream.pipe(uploadStream);
  });
}

// Enhanced middleware functions
const uploadMiddleware = {
  // Single file upload
  single: (fieldName) => {
    return (req, res, next) => {
      baseMulter.single(fieldName)(req, res, async (err) => {
        if (err) return next(err);
        if (!req.file) return next();
        
        try {
          const publicId = `ecommerce/image-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          const result = await uploadToCloudinaryBuffer(req.file.buffer, {
            folder: 'ecommerce',
            public_id: publicId,
            transformation: [{ format: 'webp' }]
          });
          
          // Enhance the file object with Cloudinary info
          req.file.path = result.secure_url || result.url;
          req.file.filename = result.public_id;
          req.file.size = result.bytes || req.file.size;
          req.file.cloudinary = result;
          
          next();
        } catch (uploadError) {
          next(uploadError);
        }
      });
    };
  },

  // Multiple files upload
  array: (fieldName, maxCount = 10) => {
    return (req, res, next) => {
      baseMulter.array(fieldName, maxCount)(req, res, async (err) => {
        if (err) return next(err);
        if (!req.files || req.files.length === 0) return next();
        
        try {
          const uploadPromises = req.files.map(async (file) => {
            const publicId = `ecommerce/image-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
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
          });
          
          req.files = await Promise.all(uploadPromises);
          next();
        } catch (uploadError) {
          next(uploadError);
        }
      });
    };
  },

  // Multiple fields upload
  fields: (fieldsArray) => {
    return (req, res, next) => {
      baseMulter.fields(fieldsArray)(req, res, async (err) => {
        if (err) return next(err);
        if (!req.files || Object.keys(req.files).length === 0) return next();
        
        try {
          const fieldNames = Object.keys(req.files);
          const uploadedPerField = {};
          
          for (const field of fieldNames) {
            const files = req.files[field];
            const uploadPromises = files.map(async (file) => {
              const publicId = `ecommerce/image-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
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
            });
            
            uploadedPerField[field] = await Promise.all(uploadPromises);
          }
          
          req.files = uploadedPerField;
          next();
        } catch (uploadError) {
          next(uploadError);
        }
      });
    };
  },

  // Expose the base multer instance for advanced usage
  multer: baseMulter
};

module.exports = uploadMiddleware;