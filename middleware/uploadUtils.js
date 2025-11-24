// middleware/uploadUtils.js
const cloudinary = require('cloudinary').v2;

const deleteFromCloudinary = async (publicId) => {
  try {
    if (!publicId) {
      throw new Error('Public ID is required');
    }

    console.log('🗑️ Cloudinary - Deleting:', publicId);
    
    const result = await cloudinary.uploader.destroy(publicId);
    
    console.log('✅ Cloudinary delete result:', result);
    
    // Handle "not found" gracefully - image might already be deleted
    if (result.result === 'not found') {
      console.log('⚠️ Image was already deleted or not found in Cloudinary:', publicId);
      return { result: 'not found', message: 'Image not found but OK' };
    }
    
    // Any other non-ok result is an error
    if (result.result !== 'ok') {
      throw new Error(`Failed to delete image: ${result.result}`);
    }
    
    return result;
  } catch (error) {
    console.error('❌ Cloudinary delete error:', error);
    throw error;
  }
};

module.exports = {
  deleteFromCloudinary
};