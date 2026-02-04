/**
 * Database Migration Script
 * 
 * Purpose: Add new fields to existing Product documents for ListingDetail support
 * Run: node server/ecommerce-backend/scripts/migrate-schema.js
 * 
 * WARNING: Only run ONCE. Backup database before running!
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const Product = require('../models/Product');

async function migrateSchema() {
  try {
    console.log('🔄 Starting schema migration...');

    // Connect to database
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI not found in .env file');
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to database');

    // Count existing products
    const totalProducts = await Product.countDocuments();
    console.log(`📊 Found ${totalProducts} existing products`);

    if (totalProducts === 0) {
      console.log('⚠️  No products found in database. Skipping migration.');
      await mongoose.disconnect();
      process.exit(0);
    }

    // Phase 1: Set default type for all existing products
    console.log('\n📝 Phase 1: Setting default type and other fields...');
    const updateResult = await Product.updateMany(
      { type: { $exists: false } },
      {
        $set: {
          type: 'product',
          cartEnabled: true,
          pricingType: 'paid',
          status: 'published',
          views: 0,
          clicks: 0,
          conversions: 0,
          platform: [],
          features: [],
          integrations: [],
          metaKeywords: []
        }
      }
    );
    console.log(`✅ Updated ${updateResult.modifiedCount} documents`);

    // Phase 2: Verify migration
    console.log('\n🔍 Phase 2: Verifying migration...');
    const sample = await Product.findOne();
    if (sample) {
      console.log('✅ Sample product structure:');
      console.log(`   type: ${sample.type}`);
      console.log(`   cartEnabled: ${sample.cartEnabled}`);
      console.log(`   views: ${sample.views}`);
      console.log(`   clicks: ${sample.clicks}`);
      console.log(`   conversions: ${sample.conversions}`);
      console.log(`   status: ${sample.status}`);
    }

    // Phase 3: Create indexes
    console.log('\n📑 Phase 3: Creating indexes...');
    try {
      await Product.collection.createIndexes([
        { type: 1, isActive: 1 },
        { category: 1, isActive: 1 },
        { isFeatured: 1, isActive: 1 },
        { createdAt: -1 }
      ]);
      console.log('✅ Indexes created successfully');
    } catch (indexError) {
      console.warn('⚠️  Index creation warning:', indexError.message);
      // Continue despite index errors - they may already exist
    }

    console.log('\n✨ Migration complete!');
    console.log('📊 Summary:');
    console.log(`   Total products: ${totalProducts}`);
    console.log(`   Updated products: ${updateResult.modifiedCount}`);
    console.log(`   New fields added: type, cartEnabled, pricingType, status, views, clicks, conversions, platform, features, integrations, metaKeywords`);
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  migrateSchema();
}

module.exports = migrateSchema;
