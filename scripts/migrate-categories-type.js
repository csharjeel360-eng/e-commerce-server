/**
 * Category Type Migration Script
 * 
 * Purpose: Add type field to existing Category documents
 * Run: node server/ecommerce-backend/scripts/migrate-categories-type.js
 * 
 * This script adds the 'type' field (product, offer, job, software) to all categories
 * that don't have one yet. Defaults to 'product' for backwards compatibility.
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const Category = require('../models/Category');

async function migrateCategories() {
  try {
    console.log('🔄 Starting category type migration...');

    // Connect to database
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI not found in .env file');
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to database');

    // Count existing categories
    const totalCategories = await Category.countDocuments();
    console.log(`📊 Found ${totalCategories} total categories`);

    if (totalCategories === 0) {
      console.log('⚠️  No categories found in database.');
      await mongoose.disconnect();
      process.exit(0);
    }

    // Find categories without type field
    const categoriesWithoutType = await Category.countDocuments({ type: { $exists: false } });
    console.log(`📊 Found ${categoriesWithoutType} categories without type field`);

    if (categoriesWithoutType === 0) {
      console.log('✅ All categories already have type field. No migration needed.');
      await mongoose.disconnect();
      process.exit(0);
    }

    // Add type field to all categories without it (default to 'product')
    console.log('\n📝 Adding type field (default: "product") to categories...');
    const updateResult = await Category.updateMany(
      { type: { $exists: false } },
      { $set: { type: 'product' } }
    );

    console.log(`✅ Updated ${updateResult.modifiedCount} categories`);

    // Verify the update
    const categoriesWithType = await Category.countDocuments({ type: { $exists: true } });
    console.log(`📊 Verification: ${categoriesWithType}/${totalCategories} categories now have type field`);

    if (categoriesWithType === totalCategories) {
      console.log('✅ Migration successful! All categories now have type field.');
    } else {
      console.warn('⚠️  Some categories might still be missing type field. Please check manually.');
    }

    // Show summary
    console.log('\n📊 Category Type Distribution:');
    const distribution = await Category.aggregate([
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    distribution.forEach(item => {
      console.log(`   ${item._id || 'unknown'}: ${item.count}`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

migrateCategories();
