// middleware/upload.js - COMPLETELY FIXED VERSION
// Using memory storage with direct Cloudinary upload (most reliable approach)

const multer = require('multer');
const { Readable } = require('stream');

// Initialize cloudinary with proper error handling
let cloudinary;
try {
  cloudinary = require('../config/cloudinary');
  console.log('✅ Cloudinary loaded successfully');
} catch (error) {
  console.error('❌ Failed to load Cloudinary:', error.message);
  throw new Error('Cloudinary configuration is required');
}

// Create memory storage (most reliable)
const storage = multer.memoryStorage();

// File filter function
const fileFilter = (req, file, cb) => {
  // Check if file is an image
  if (file.mimetype && file.mimetype.startsWith('image/')) {
    console.log(`✅ Accepting file: ${file.originalname} (${file.mimetype})`);
    cb(null, true);
  } else {
    console.log(`❌ Rejecting file: ${file.originalname} (${file.mimetype})`);
    cb(new Error('Only image files are allowed! Supported formats: JPEG, PNG, WebP, GIF'), false);
  }
};

// Create multer instance
const multerInstance = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 10 // Maximum 10 files
  }
});

// Cloudinary upload function for buffer
const uploadToCloudinary = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    if (!cloudinary || !cloudinary.uploader) {
      return reject(new Error('Cloudinary uploader is not available'));
    }

    const uploadOptions = {
      folder: 'ecommerce',
      resource_type: 'image',
      transformation: [
        { quality: 'auto', fetch_format: 'auto' }
      ],
      ...options
    };

    // Create upload stream
    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          console.error('❌ Cloudinary upload error:', error);
          reject(error);
        } else {
          console.log('✅ Cloudinary upload successful:', result.public_id);
          resolve(result);
        }
      }
    );

    // Convert buffer to stream and pipe to Cloudinary
    const readableStream = new Readable();
    readableStream._read = () => {}; // Required implementation
    readableStream.push(buffer);
    readableStream.push(null); // Signal end of data
    readableStream.pipe(uploadStream);
  });
};

// Enhanced single file upload middleware
const singleUpload = (fieldName) => {
  return (req, res, next) => {
    console.log(`📤 Starting single file upload for field: ${fieldName}`);
    
    multerInstance.single(fieldName)(req, res, async (err) => {
      if (err) {
        console.error('❌ Multer error:', err.message);
        return next(err);
      }

      // If no file was uploaded, continue
      if (!req.file) {
        console.log('ℹ️ No file uploaded, continuing...');
        return next();
      }

      console.log(`📁 Processing file: ${req.file.originalname} (${req.file.size} bytes)`);

      try {
        // Upload to Cloudinary
        const result = await uploadToCloudinary(req.file.buffer, {
          public_id: `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        });

        // Attach Cloudinary result to file object
        req.file.cloudinary = {
          public_id: result.public_id,
          url: result.secure_url,
          format: result.format,
          bytes: result.bytes,
          width: result.width,
          height: result.height
        };

        // Update file object with Cloudinary URL
        req.file.path = result.secure_url;
        req.file.filename = result.public_id;
        req.file.size = result.bytes;

        console.log(`✅ File uploaded successfully: ${req.file.cloudinary.url}`);
        next();

      } catch (uploadError) {
        console.error('❌ Cloudinary upload failed:', uploadError.message);
        next(uploadError);
      }
    });
  };
};

// Enhanced multiple files upload middleware
const arrayUpload = (fieldName, maxCount = 5) => {
  return (req, res, next) => {
    console.log(`📤 Starting multiple files upload for field: ${fieldName} (max: ${maxCount})`);
    
    multerInstance.array(fieldName, maxCount)(req, res, async (err) => {
      if (err) {
        console.error('❌ Multer error:', err.message);
        return next(err);
      }

      // If no files were uploaded, continue
      if (!req.files || req.files.length === 0) {
        console.log('ℹ️ No files uploaded, continuing...');
        return next();
      }

      console.log(`📁 Processing ${req.files.length} files`);

      try {
        const uploadPromises = req.files.map(async (file, index) => {
          console.log(`📄 Uploading file ${index + 1}: ${file.originalname}`);
          
          const result = await uploadToCloudinary(file.buffer, {
            public_id: `img_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`
          });

          return {
            originalname: file.originalname,
            filename: result.public_id,
            path: result.secure_url,
            size: result.bytes,
            mimetype: file.mimetype,
            cloudinary: {
              public_id: result.public_id,
              url: result.secure_url,
              format: result.format,
              bytes: result.bytes,
              width: result.width,
              height: result.height
            }
          };
        });

        // Wait for all uploads to complete
        const uploadedFiles = await Promise.all(uploadPromises);
        req.files = uploadedFiles;

        console.log(`✅ All ${uploadedFiles.length} files uploaded successfully`);
        next();

      } catch (uploadError) {
        console.error('❌ Cloudinary upload failed:', uploadError.message);
        next(uploadError);
      }
    });
  };
};

// Fields upload middleware (multiple fields)
const fieldsUpload = (fields) => {
  return (req, res, next) => {
    console.log(`📤 Starting fields upload:`, fields);
    
    multerInstance.fields(fields)(req, res, async (err) => {
      if (err) {
        console.error('❌ Multer error:', err.message);
        return next(err);
      }

      // If no files were uploaded, continue
      if (!req.files || Object.keys(req.files).length === 0) {
        console.log('ℹ️ No files uploaded, continuing...');
        return next();
      }

      console.log(`📁 Processing files in ${Object.keys(req.files).length} fields`);

      try {
        const uploadResults = {};
        const fieldNames = Object.keys(req.files);

        for (const fieldName of fieldNames) {
          const files = req.files[fieldName];
          console.log(`📄 Processing ${files.length} files in field: ${fieldName}`);

          const uploadPromises = files.map(async (file, index) => {
            const result = await uploadToCloudinary(file.buffer, {
              public_id: `${fieldName}_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`
            });

            return {
              originalname: file.originalname,
              filename: result.public_id,
              path: result.secure_url,
              size: result.bytes,
              mimetype: file.mimetype,
              cloudinary: {
                public_id: result.public_id,
                url: result.secure_url,
                format: result.format,
                bytes: result.bytes,
                width: result.width,
                height: result.height
              }
            };
          });

          uploadResults[fieldName] = await Promise.all(uploadPromises);
          console.log(`✅ Field ${fieldName} uploaded successfully`);
        }

        req.files = uploadResults;
        console.log(`✅ All fields uploaded successfully`);
        next();

      } catch (uploadError) {
        console.error('❌ Cloudinary upload failed:', uploadError.message);
        next(uploadError);
      }
    });
  };
};

// Test endpoint to verify upload functionality
const testUpload = (req, res) => {
  res.json({
    success: true,
    message: 'Upload middleware is working correctly',
    timestamp: new Date().toISOString(),
    cloudinary: {
      configured: !!cloudinary,
      uploader_available: !!(cloudinary && cloudinary.uploader)
    }
  });
};

// Export the upload middleware
module.exports = {
  single: singleUpload,
  array: arrayUpload,
  fields: fieldsUpload,
  multer: multerInstance,
  test: testUpload,
  uploadToCloudinary // Export for direct use if needed
};