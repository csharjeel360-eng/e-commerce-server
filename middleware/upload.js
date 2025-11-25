const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { Readable } = require('stream');

// Try to use multer-storage-cloudinary if available; otherwise fallback to memory storage
let multerInstance = null;
let usingAdapter = false;
try {
  const multerStorageCloudinary = require('multer-storage-cloudinary');
  const CloudinaryStorage = multerStorageCloudinary.CloudinaryStorage || multerStorageCloudinary.default || multerStorageCloudinary;
  if (typeof CloudinaryStorage === 'function') {
    const storage = new CloudinaryStorage({
      cloudinary: cloudinary,
      params: {
        folder: 'ecommerce',
        format: async () => 'webp',
        public_id: () => `image-${Date.now()}-${Math.round(Math.random() * 1E9)}`,
      },
    });

    const fileFilter = (req, file, cb) => {
      if (file.mimetype && file.mimetype.startsWith && file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Not an image! Please upload only images.'), false);
      }
    };

    multerInstance = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });
    usingAdapter = true;
  }
} catch (e) {
  // adapter not available — will fallback
}

// Fallback: memory storage + direct Cloudinary upload_stream
if (!multerInstance) {
  const storage = multer.memoryStorage();
  multerInstance = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

  async function uploadToCloudinaryBuffer(buffer, options = {}) {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
        if (error) return reject(error);
        resolve(result);
      });
      const s = new Readable();
      s._read = () => {};
      s.push(buffer);
      s.push(null);
      s.pipe(uploadStream);
    });
  }

  // Wrap multer's single/array to perform Cloudinary upload after multer stores buffer
  const originalSingle = multerInstance.single.bind(multerInstance);
  const originalArray = multerInstance.array.bind(multerInstance);

  module.exports = {
    single: (fieldName) => (req, res, next) => {
      originalSingle(fieldName)(req, res, async (err) => {
        if (err) return next(err);
        if (!req.file) return next();
        try {
          const publicId = `ecommerce/image-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          const result = await uploadToCloudinaryBuffer(req.file.buffer, {
            folder: 'ecommerce',
            public_id: publicId,
            transformation: [{ format: 'webp' }]
          });
          req.file.path = result.secure_url || result.url;
          req.file.filename = result.public_id;
          req.file.size = result.bytes || req.file.size;
          next();
        } catch (uploadError) {
          next(uploadError);
        }
      });
    },
    array: (fieldName, maxCount = 10) => (req, res, next) => {
      originalArray(fieldName, maxCount)(req, res, async (err) => {
        if (err) return next(err);
        if (!req.files || req.files.length === 0) return next();
        try {
          const uploads = await Promise.all(req.files.map(async (file) => {
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
              size: result.bytes || file.size
            };
          }));
          req.files = uploads.map(u => ({
            originalname: u.originalname,
            filename: u.filename,
            path: u.path,
            size: u.size
          }));
          next();
        } catch (uploadError) {
          next(uploadError);
        }
      });
    },
    fields: (fieldsArray) => (req, res, next) => {
      // fieldsArray is an array of { name, maxCount }
      const originalFields = multerInstance.fields.bind(multerInstance);
      originalFields(fieldsArray)(req, res, async (err) => {
        if (err) return next(err);
        if (!req.files || Object.keys(req.files).length === 0) return next();
        try {
          const fieldNames = Object.keys(req.files);
          const uploadedPerField = {};
          for (const field of fieldNames) {
            const files = req.files[field];
            const uploads = await Promise.all(files.map(async (file) => {
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
                size: result.bytes || file.size
              };
            }));
            uploadedPerField[field] = uploads;
          }
          req.files = uploadedPerField;
          next();
        } catch (uploadError) {
          next(uploadError);
        }
      });
    },
    // expose underlying multer instance for advanced usage
    multer: multerInstance
  };
}

// If we reached here, multerInstance uses adapter and we should export compatible API
if (usingAdapter) {
  module.exports = {
    single: (fieldName) => multerInstance.single(fieldName),
    array: (fieldName, maxCount = 10) => multerInstance.array(fieldName, maxCount),
    fields: (fieldsArray) => multerInstance.fields(fieldsArray),
    multer: multerInstance
  };
}