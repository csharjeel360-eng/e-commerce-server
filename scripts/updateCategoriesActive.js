const mongoose = require('mongoose');
const Category = require('../models/Category');
require('dotenv').config();

async function updateCategoriesActive() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    console.log('📝 Updating all categories to isActive = true...');
    const result = await Category.updateMany({}, { isActive: true });
    
    console.log(`✅ Successfully updated ${result.modifiedCount} categories`);
    console.log(`   Matched: ${result.matchedCount}`);
    
    // Show updated categories
    const categories = await Category.find().select('name type isActive');
    console.log('\n📋 Updated categories:');
    categories.forEach(cat => {
      console.log(`   - ${cat.name} (type: ${cat.type}, active: ${cat.isActive})`);
    });

    console.log('\n✅ All done!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  updateCategoriesActive();
}

module.exports = updateCategoriesActive;
