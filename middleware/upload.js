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