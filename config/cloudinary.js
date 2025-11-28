const cloudinary = require('cloudinary').v2;

const configureCloudinary = () => {
  try {
    console.log('🔧 ========== CLOUDINARY CONFIGURATION ==========');
    
    // Check environment variables with more detailed logging
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    console.log('📋 Environment Variables Check:');
    console.log('   CLOUDINARY_CLOUD_NAME:', cloudName ? `"${cloudName}"` : '❌ MISSING');
    console.log('   CLOUDINARY_API_KEY:', apiKey ? '***' + apiKey.slice(-4) : '❌ MISSING');
    console.log('   CLOUDINARY_API_SECRET:', apiSecret ? '***' + apiSecret.slice(-4) : '❌ MISSING');
    console.log('   NODE_ENV:', process.env.NODE_ENV || 'not set');

    // Log all Cloudinary-related env vars for debugging
    console.log('🔍 All Cloudinary env vars:');
    Object.keys(process.env).forEach(key => {
      if (key.includes('CLOUDINARY') || key.includes('cloudinary')) {
        console.log(`   ${key}:`, process.env[key] ? '***' + process.env[key].slice(-4) : 'empty');
      }
    });

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error(
        `Missing required Cloudinary environment variables. Check your .env file or Vercel environment variables. 
        Missing: ${!cloudName ? 'CLOUDINARY_CLOUD_NAME ' : ''}${!apiKey ? 'CLOUDINARY_API_KEY ' : ''}${!apiSecret ? 'CLOUDINARY_API_SECRET' : ''}`
      );
    }

    // Configure Cloudinary
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true
    });

    console.log('✅ Cloudinary configured successfully');
    console.log('🏁 Cloud name:', cloudName);
    console.log('🔧 ========== CONFIGURATION COMPLETE ==========');

    return cloudinary;

  } catch (error) {
    console.error('❌ ========== CLOUDINARY CONFIGURATION FAILED ==========');
    console.error('   Error:', error.message);
    console.error('   Stack:', error.stack);
    console.error('❌ =============================================');
    return null;
  }
};

// Initialize Cloudinary immediately
const cloudinaryInstance = configureCloudinary();

// Enhanced test function
const testCloudinaryConnection = async () => {
  if (!cloudinaryInstance) {
    console.log('❌ Cloudinary instance is null - configuration failed');
    return false;
  }

  try {
    console.log('🔄 Testing Cloudinary connection...');
    const result = await cloudinaryInstance.api.ping();
    console.log('✅ Cloudinary connection test passed');
    console.log('📊 API Status:', result);
    return true;
  } catch (error) {
    console.error('❌ Cloudinary connection test failed:');
    console.error('   Message:', error.message);
    console.error('   HTTP Code:', error.http_code);
    console.error('   Name:', error.name);
    return false;
  }
};

// Test connection on startup (optional)
if (process.env.NODE_ENV !== 'test') {
  testCloudinaryConnection().then(success => {
    if (success) {
      console.log('🚀 Cloudinary is ready for use');
    } else {
      console.log('💡 Cloudinary is not available - uploads will fail');
    }
  });
}

module.exports = cloudinaryInstance;