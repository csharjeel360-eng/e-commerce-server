const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configure Cloudinary
const configureCloudinary = () => {
  try {
    console.log('🔧 Initializing Cloudinary...');
    
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

    console.log('✅ All Cloudinary environment variables are present');

    // Configure Cloudinary
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true
    });

    console.log('✅ Cloudinary configured successfully');
    console.log('📁 Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME);
    console.log('🔑 API Key:', process.env.CLOUDINARY_API_KEY ? '***' + process.env.CLOUDINARY_API_KEY.slice(-4) : 'Not set');

    // Test Cloudinary connection by making a simple API call
    console.log('🔄 Testing Cloudinary connection...');
    
    // Simple test to verify uploader is available
    if (!cloudinary.uploader) {
      throw new Error('Cloudinary uploader is not available after configuration');
    }

    console.log('✅ Cloudinary uploader is available and ready');

    return cloudinary;

  } catch (error) {
    console.error('❌ Cloudinary configuration failed:', error.message);
    console.error('💡 Please check your environment variables:');
    console.error('   - CLOUDINARY_CLOUD_NAME');
    console.error('   - CLOUDINARY_API_KEY');
    console.error('   - CLOUDINARY_API_SECRET');
    throw error;
  }
};

// Initialize Cloudinary
let cloudinaryInstance;
try {
  cloudinaryInstance = configureCloudinary();
} catch (error) {
  console.error('💥 Failed to initialize Cloudinary. Uploads will not work.');
  cloudinaryInstance = null;
}

// Create Cloudinary storage for Multer
const createCloudinaryStorage = (folder = 'ecommerce') => {
  try {
    if (!cloudinaryInstance) {
      throw new Error('Cloudinary is not configured. Please check your environment variables.');
    }

    const storage = new CloudinaryStorage({
      cloudinary: cloudinaryInstance,
      params: {
        folder: folder,
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
        format: async (req, file) => {
          // Determine format based on file mimetype
          if (file.mimetype === 'image/jpeg') return 'jpg';
          if (file.mimetype === 'image/png') return 'png';
          if (file.mimetype === 'image/webp') return 'webp';
          if (file.mimetype === 'image/gif') return 'gif';
          return 'jpg'; // default
        },
        public_id: (req, file) => {
          // Generate unique filename
          const timestamp = Date.now();
          const randomString = Math.random().toString(36).substring(2, 15);
          const originalName = file.originalname.split('.')[0].replace(/[^a-zA-Z0-9]/g, '_');
          return `${folder}/${originalName}_${timestamp}_${randomString}`;
        },
        transformation: [
          { width: 1200, height: 800, crop: 'limit', quality: 'auto' },
          { format: 'auto' }
        ]
      },
    });

    console.log(`✅ Cloudinary storage created for folder: ${folder}`);
    return storage;

  } catch (error) {
    console.error('❌ Failed to create Cloudinary storage:', error.message);
    throw error;
  }
};

// Alternative: Simple memory storage with direct Cloudinary upload (more reliable)
const createMemoryStorageWithCloudinaryUpload = () => {
  const multer = require('multer');
  const { Readable } = require('stream');
  
  const storage = multer.memoryStorage();
  
  const uploadToCloudinary = (buffer, options = {}) => {
    return new Promise((resolve, reject) => {
      if (!cloudinaryInstance || !cloudinaryInstance.uploader) {
        return reject(new Error('Cloudinary is not configured'));
      }

      const uploadOptions = {
        folder: 'ecommerce',
        resource_type: 'image',
        ...options
      };

      const uploadStream = cloudinaryInstance.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        }
      );

      const readableStream = Readable.from(buffer);
      readableStream.pipe(uploadStream);
    });
  };

  return { storage, uploadToCloudinary };
};

// Utility functions for Cloudinary operations
const cloudinaryUtils = {
  // Upload image directly
  uploadImage: async (fileBuffer, options = {}) => {
    if (!cloudinaryInstance) {
      throw new Error('Cloudinary is not configured');
    }
    
    return new Promise((resolve, reject) => {
      cloudinaryInstance.uploader.upload_stream(
        {
          folder: 'ecommerce',
          resource_type: 'image',
          ...options
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(fileBuffer);
    });
  },

  // Delete image from Cloudinary
  deleteImage: async (publicId) => {
    if (!cloudinaryInstance) {
      throw new Error('Cloudinary is not configured');
    }
    
    try {
      const result = await cloudinaryInstance.uploader.destroy(publicId);
      console.log('🗑️ Cloudinary delete result:', result);
      return result;
    } catch (error) {
      console.error('❌ Cloudinary delete error:', error);
      throw error;
    }
  },

  // Check if Cloudinary is available
  isAvailable: () => {
    return !!(cloudinaryInstance && cloudinaryInstance.uploader);
  },

  // Get Cloudinary configuration status
  getStatus: () => {
    return {
      configured: !!cloudinaryInstance,
      uploaderAvailable: !!(cloudinaryInstance && cloudinaryInstance.uploader),
      cloudName: process.env.CLOUDINARY_CLOUD_NAME || 'Not set',
      apiKey: process.env.CLOUDINARY_API_KEY ? '***' + process.env.CLOUDINARY_API_KEY.slice(-4) : 'Not set'
    };
  }
};

// Test Cloudinary connection on startup
if (cloudinaryInstance) {
  console.log('🔄 Performing final Cloudinary connection test...');
  cloudinaryInstance.api.ping()
    .then(result => {
      console.log('✅ Cloudinary connection test passed');
    })
    .catch(error => {
      console.error('❌ Cloudinary connection test failed:', error.message);
    });
} else {
  console.error('💥 Cloudinary is not available. Image uploads will fail.');
}

module.exports = {
  cloudinary: cloudinaryInstance,
  createCloudinaryStorage,
  createMemoryStorageWithCloudinaryUpload,
  configureCloudinary,
  ...cloudinaryUtils
};