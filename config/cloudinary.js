const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configure Cloudinary
const configureCloudinary = () => {
  try {
    // Check if required environment variables are present
    const requiredEnvVars = [
      'CLOUDINARY_CLOUD_NAME',
      'CLOUDINARY_API_KEY', 
      'CLOUDINARY_API_SECRET'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.error('❌ Missing Cloudinary environment variables:', missingVars);
      throw new Error(`Missing Cloudinary config: ${missingVars.join(', ')}`);
    }

    // Configure Cloudinary
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true
    });

    console.log('✅ Cloudinary configured successfully');
    console.log('📁 Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME);

    return cloudinary;

  } catch (error) {
    console.error('❌ Cloudinary configuration failed:', error.message);
    throw error;
  }
};

// Initialize Cloudinary
const cloudinaryInstance = configureCloudinary();

// Create Cloudinary storage for Multer
const createCloudinaryStorage = (folder = 'ecommerce') => {
  try {
    const storage = new CloudinaryStorage({
      cloudinary: cloudinaryInstance,
      params: {
        folder: folder,
        format: async (req, file) => {
          // Determine format based on file mimetype
          if (file.mimetype === 'image/jpeg') return 'jpg';
          if (file.mimetype === 'image/png') return 'png';
          if (file.mimetype === 'image/webp') return 'webp';
          return 'jpg'; // default
        },
        public_id: (req, file) => {
          // Generate unique filename
          const timestamp = Date.now();
          const originalName = file.originalname.split('.')[0];
          return `${originalName}_${timestamp}`;
        },
        transformation: [
          { width: 1200, height: 800, crop: 'limit', quality: 'auto' },
          { format: 'auto' }
        ]
      },
    });

    console.log('✅ Cloudinary storage created for folder:', folder);
    return storage;

  } catch (error) {
    console.error('❌ Failed to create Cloudinary storage:', error.message);
    throw error;
  }
};

module.exports = {
  cloudinary: cloudinaryInstance,
  createCloudinaryStorage,
  configureCloudinary
};