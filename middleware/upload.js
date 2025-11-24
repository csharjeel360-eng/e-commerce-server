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
 const multer = require('multer');
// Support both CommonJS and variations in how multer-storage-cloudinary exports
const multerStorageCloudinary = require('multer-storage-cloudinary');
// Support multiple export shapes: named `CloudinaryStorage`, default export, or module itself
const CloudinaryStorage = multerStorageCloudinary.CloudinaryStorage || multerStorageCloudinary.default || multerStorageCloudinary;
const cloudinary = require('../config/cloudinary');

// Cloudinary storage configuration
if (typeof CloudinaryStorage !== 'function') {
  let pkgInfo = {};
  try {
    pkgInfo = require('../package.json');
  } catch (e) {
    // ignore
  }
  console.error('CloudinaryStorage constructor not found. multer-storage-cloudinary export keys:', Object.keys(multerStorageCloudinary || {}));
  console.error('Installed multer-storage-cloudinary version:', pkgInfo.dependencies && pkgInfo.dependencies['multer-storage-cloudinary']);
  throw new Error('CloudinaryStorage is not a constructor. Check multer-storage-cloudinary export shape and installed version.');
}

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'ecommerce',
    format: async (req, file) => 'webp',
    public_id: (req, file) => {
      return `image-${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    },
  },
});

const fileFilter = (req, file, cb) => {
  // Check if file is an image
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Not an image! Please upload only images.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
});

// Export the upload object directly
module.exports = upload;