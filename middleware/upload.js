const multer = require('multer');
const streamifier = require('streamifier');
const cloudinary = require('../config/cloudinary');

// Use memory storage so we control how files are uploaded to Cloudinary
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  }
});

function uploadToCloudinaryBuffer(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
}

// Wrapper to behave like multer's .single and .array but upload to Cloudinary
function single(fieldName) {
  return function (req, res, next) {
    upload.single(fieldName)(req, res, async (err) => {
      if (err) return next(err);
      if (!req.file) return next();

      try {
        const publicId = `ecommerce/image-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const result = await uploadToCloudinaryBuffer(req.file.buffer, {
          folder: 'ecommerce',
          public_id: publicId,
          transformation: [{ format: 'webp' }]
        });

        // Populate fields similar to multer-storage-cloudinary
        req.file.path = result.secure_url || result.url;
        req.file.filename = result.public_id;
        req.file.size = result.bytes || req.file.size;
        next();
      } catch (uploadError) {
        next(uploadError);
      }
    });
  };
}

function array(fieldName, maxCount = 10) {
  return function (req, res, next) {
    upload.array(fieldName, maxCount)(req, res, async (err) => {
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

        // Replace req.files with Cloudinary results in expected shape
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
  };
}

module.exports = {
  single,
  array,
  // Export the underlying multer instance in case other code needs it
  multer: upload
};