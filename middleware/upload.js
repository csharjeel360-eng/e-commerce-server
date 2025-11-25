// Unified upload middleware
// Uses multer-storage-cloudinary if available, otherwise memory storage + direct Cloudinary upload_stream
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { Readable } = require('stream');

let multerInstance = null;
let adapterAvailable = false;
try {
  const multerStorageCloudinary = require('multer-storage-cloudinary');
  const CloudinaryStorage = multerStorageCloudinary.CloudinaryStorage || multerStorageCloudinary.default || multerStorageCloudinary;
  if (typeof CloudinaryStorage === 'function') {
    const storage = new CloudinaryStorage({
      cloudinary,
      params: {
        folder: 'ecommerce',
        format: async () => 'webp',
        public_id: () => `image-${Date.now()}-${Math.round(Math.random() * 1e9)}`
      }
    });
    multerInstance = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
    adapterAvailable = true;
  }
} catch (e) {
  // adapter not present or failed to initialize; fallback below
}

if (!multerInstance) {
  const storage = multer.memoryStorage();
  multerInstance = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

  async function uploadToCloudinaryBuffer(buffer, options = {}) {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(options, (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
      const s = new Readable();
      s._read = () => {};
      s.push(buffer);
      s.push(null);
      s.pipe(uploadStream);
    });
  }

  const originalSingle = multerInstance.single.bind(multerInstance);
  const originalArray = multerInstance.array.bind(multerInstance);
  const originalFields = multerInstance.fields.bind(multerInstance);

  module.exports = {
    single: (fieldName) => (req, res, next) => {
      originalSingle(fieldName)(req, res, async (err) => {
        if (err) return next(err);
        if (!req.file) return next();
        try {
          const publicId = `image-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          const result = await uploadToCloudinaryBuffer(req.file.buffer, { folder: 'ecommerce', public_id: publicId, transformation: [{ format: 'webp' }] });
          req.file.path = result.secure_url || result.url;
          req.file.filename = result.public_id;
          req.file.size = result.bytes || req.file.size;
          next();
        } catch (uploadError) {
          next(uploadError);
        }
      });
    },
    array: (fieldName, max = 10) => (req, res, next) => {
      originalArray(fieldName, max)(req, res, async (err) => {
        if (err) return next(err);
        if (!req.files || req.files.length === 0) return next();
        try {
          const uploaded = await Promise.all(req.files.map(async (file) => {
            const publicId = `image-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
            const result = await uploadToCloudinaryBuffer(file.buffer, { folder: 'ecommerce', public_id: publicId, transformation: [{ format: 'webp' }] });
            return { originalname: file.originalname, filename: result.public_id, path: result.secure_url || result.url, size: result.bytes || file.size };
          }));
          req.files = uploaded;
          next();
        } catch (uploadError) {
          next(uploadError);
        }
      });
    },
    fields: (fieldsArray) => (req, res, next) => {
      originalFields(fieldsArray)(req, res, async (err) => {
        if (err) return next(err);
        if (!req.files || Object.keys(req.files).length === 0) return next();
        try {
          const fieldNames = Object.keys(req.files);
          const resultObj = {};
          for (const field of fieldNames) {
            const files = req.files[field];
            const uploaded = await Promise.all(files.map(async (file) => {
              const publicId = `image-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
              const result = await uploadToCloudinaryBuffer(file.buffer, { folder: 'ecommerce', public_id: publicId, transformation: [{ format: 'webp' }] });
              return { originalname: file.originalname, filename: result.public_id, path: result.secure_url || result.url, size: result.bytes || file.size };
            }));
            resultObj[field] = uploaded;
          }
          req.files = resultObj;
          next();
        } catch (uploadError) {
          next(uploadError);
        }
      });
    },
    multer: multerInstance
  };
}

// If adapter is available, export multerInstance-compatible API
if (adapterAvailable) {
  module.exports = {
    single: (fieldName) => multerInstance.single(fieldName),
    array: (fieldName, maxCount = 10) => multerInstance.array(fieldName, maxCount),
    fields: (fieldsArray) => multerInstance.fields(fieldsArray),
    multer: multerInstance
  };
}