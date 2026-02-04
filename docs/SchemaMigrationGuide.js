/**
 * SCHEMA MIGRATION GUIDE
 * 
 * How to apply the extended ListingDetail schema to the live database
 * 
 * File: server/ecommerce-backend/scripts/migrate-schema.js
 */

/**
 * STEP 1: Update Product.js Model
 * 
 * Location: server/ecommerce-backend/models/Product.js
 * 
 * ADD these fields to the productSchema:
 */

const exampleExtendedSchema = {
  // ============================================
  // TYPE SYSTEM (NEW)
  // ============================================
  type: {
    type: String,
    enum: ['product', 'tool', 'job'],
    default: 'product',
    index: true
  },

  // ============================================
  // AFFILIATE SUPPORT (NEW)
  // ============================================
  externalLink: {
    type: String,
    default: null,
    // For tools: affiliate/referral link
    // For jobs: application URL
    // For products: null (uses cart)
  },

  affiliateSource: {
    type: String,
    enum: ['producthunt', 'appsumo', 'capterra', 'company_website', 'other'],
    default: null
  },

  affiliateId: {
    type: String,
    default: null
  },

  // ============================================
  // PRICING SYSTEM (NEW/EXTENDED)
  // ============================================
  pricingType: {
    type: String,
    enum: ['free', 'paid', 'freemium'],
    default: 'paid'
  },

  // Existing: price, originalPrice
  // These remain unchanged for backward compatibility

  // ============================================
  // CART CONTROL (NEW)
  // ============================================
  cartEnabled: {
    type: Boolean,
    default: true
    // If false: product mode disabled, show only external link (if provided)
    // If true & no externalLink: show Add to Cart + Buy Now
    // If true & externalLink: show external link + cart options
  },

  // ============================================
  // TOOL-SPECIFIC FIELDS (NEW)
  // ============================================
  platform: {
    type: [String],
    enum: ['web', 'windows', 'macos', 'ios', 'android', 'linux'],
    default: []
    // Only populated for type === 'tool'
  },

  features: {
    type: [String],
    default: []
    // ["AI-powered", "API access", "Real-time sync"]
  },

  integrations: {
    type: [String],
    default: []
    // ["Slack", "Zapier", "Notion"]
  },

  // ============================================
  // JOB-SPECIFIC FIELDS (NEW)
  // ============================================
  companyName: {
    type: String,
    default: null
    // Only required for type === 'job'
  },

  jobType: {
    type: String,
    enum: ['full-time', 'part-time', 'contract', 'freelance', 'internship'],
    default: null
  },

  location: {
    type: String,
    default: null
    // "San Francisco, CA" or "Remote"
  },

  salary: {
    type: String,
    default: null
    // "$80k - $120k" or "Competitive"
  },

  experienceLevel: {
    type: String,
    enum: ['any', 'entry', 'mid', 'senior'],
    default: 'any'
  },

  applicationDeadline: {
    type: Date,
    default: null
  },

  // ============================================
  // CONTENT CONTROL (NEW/EXTENDED)
  // ============================================
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft'
  },

  isFeatured: {
    type: Boolean,
    default: false,
    index: true
  },

  isActive: {
    type: Boolean,
    default: true,
    index: true
  },

  approvedBy: {
    type: String,
    default: null
    // Admin user ID who approved
  },

  approvedAt: {
    type: Date,
    default: null
  },

  // ============================================
  // ANALYTICS TRACKING (NEW)
  // ============================================
  views: {
    type: Number,
    default: 0
  },

  clicks: {
    type: Number,
    default: 0
  },

  conversions: {
    type: Number,
    default: 0
  },

  // ============================================
  // SEO SUPPORT (NEW/EXTENDED)
  // ============================================
  metaTitle: {
    type: String,
    default: null
  },

  metaDescription: {
    type: String,
    default: null
  },

  metaKeywords: {
    type: [String],
    default: []
  },

  schema: {
    type: String,
    enum: ['SoftwareApplication', 'JobPosting', 'Product', 'none'],
    default: 'none'
    // For JSON-LD structured data
  }
};

/**
 * STEP 2: Create ListingTrack Model
 * 
 * Location: server/ecommerce-backend/models/ListingTrack.js (NEW FILE)
 */

const listingTrackSchema = {
  listingId: {
    type: String,
    required: true,
    index: true,
    ref: 'Product'
  },

  listingType: {
    type: String,
    enum: ['product', 'tool', 'job'],
    default: 'product'
  },

  eventType: {
    type: String,
    enum: ['view', 'click', 'conversion'],
    required: true,
    index: true
  },

  clickType: {
    type: String,
    enum: ['visit_link', 'apply', 'add_to_cart', 'buy_now'],
    default: null
    // Only populated if eventType === 'click'
  },

  conversionType: {
    type: String,
    enum: ['purchase', 'signup', 'application', 'newsletter'],
    default: null
    // Only populated if eventType === 'conversion'
  },

  conversionValue: {
    type: Number,
    default: 0
    // Revenue or point value, if applicable
  },

  userId: {
    type: String,
    default: null
    // Anonymous if not logged in
  },

  ipAddress: {
    type: String,
    default: null
  },

  userAgent: {
    type: String,
    default: null
  },

  referrer: {
    type: String,
    default: null
  },

  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
};

/**
 * STEP 3: Database Migration Script
 * 
 * Run: node scripts/migrate-schema.js
 * 
 * Purpose: Add new fields to existing Product documents
 * Strategy: Set defaults to ensure backward compatibility
 */

const mongoose = require('mongoose');
const Product = require('../models/Product');

async function migrateSchema() {
  try {
    console.log('🔄 Starting schema migration...');

    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to database');

    // Count existing products
    const totalProducts = await Product.countDocuments();
    console.log(`📊 Found ${totalProducts} existing products`);

    // Phase 1: Set default type for all existing products
    console.log('\n📝 Phase 1: Setting default type...');
    const updateResult = await Product.updateMany(
      { type: { $exists: false } },
      {
        $set: {
          type: 'product',
          cartEnabled: true,
          pricingType: 'paid',
          status: 'published',
          isActive: true,
          views: 0,
          clicks: 0,
          conversions: 0,
          platform: [],
          features: [],
          integrations: [],
          tags: [],
          metaKeywords: []
        }
      }
    );
    console.log(`✅ Updated ${updateResult.modifiedCount} documents`);

    // Phase 2: Verify migration
    console.log('\n🔍 Phase 2: Verifying migration...');
    const sample = await Product.findOne();
    console.log('Sample product structure:', {
      type: sample.type,
      cartEnabled: sample.cartEnabled,
      views: sample.views,
      clicks: sample.clicks,
      conversions: sample.conversions,
      externalLink: sample.externalLink,
      isFeatured: sample.isFeatured
    });

    // Phase 3: Create indexes
    console.log('\n📑 Phase 3: Creating indexes...');
    await Product.collection.createIndexes([
      { type: 1, isActive: 1 },
      { category: 1, isActive: 1 },
      { isFeatured: 1, isActive: 1 },
      { createdAt: -1 }
    ]);
    console.log('✅ Indexes created');

    console.log('\n✨ Migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  migrateSchema();
}

module.exports = migrateSchema;

/**
 * STEP 4: Update Validation Rules
 * 
 * Location: server/ecommerce-backend/middleware/validation.js
 * 
 * Add these validation rules:
 */

const validateListingCreation = (req, res, next) => {
  const { type, externalLink, companyName, price, cartEnabled } = req.body;

  // Validate type
  if (type && !['product', 'tool', 'job'].includes(type)) {
    return res.status(400).json({ error: 'Invalid type' });
  }

  // If type is 'tool', require externalLink
  if (type === 'tool' && !externalLink) {
    return res.status(400).json({ error: 'Tools must have externalLink' });
  }

  // If type is 'job', require externalLink and companyName
  if (type === 'job') {
    if (!externalLink) return res.status(400).json({ error: 'Jobs must have externalLink' });
    if (!companyName) return res.status(400).json({ error: 'Jobs must have companyName' });
  }

  // If type is 'product' and cartEnabled, require price
  if (type === 'product' && cartEnabled !== false && !price) {
    return res.status(400).json({ error: 'Products with cart must have price' });
  }

  next();
};

/**
 * STEP 5: Update API Responses
 * 
 * Update your productController.js to include new fields in responses:
 */

const getListingResponse = (product) => {
  return {
    _id: product._id,
    title: product.title,
    slug: product.slug,
    description: product.description,
    category: product.category,
    images: product.images,
    price: product.price,
    originalPrice: product.originalPrice,
    stock: product.stock,

    // NEW: Type & affiliate fields
    type: product.type,
    externalLink: product.externalLink,
    affiliateSource: product.affiliateSource,
    pricingType: product.pricingType,
    cartEnabled: product.cartEnabled,

    // NEW: Tool-specific
    platform: product.platform,
    features: product.features,
    integrations: product.integrations,

    // NEW: Job-specific
    companyName: product.companyName,
    jobType: product.jobType,
    location: product.location,
    salary: product.salary,
    experienceLevel: product.experienceLevel,
    applicationDeadline: product.applicationDeadline,

    // NEW: Analytics
    views: product.views,
    clicks: product.clicks,
    conversions: product.conversions,

    // NEW: Content control
    status: product.status,
    isFeatured: product.isFeatured,
    isActive: product.isActive,
    approvedBy: product.approvedBy,
    approvedAt: product.approvedAt,

    // Existing fields
    rating: product.rating,
    reviews: product.reviews,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  };
};

/**
 * STEP 6: Backward Compatibility Checks
 * 
 * Add middleware to handle old API calls gracefully:
 */

const handleBackwardCompatibility = (req, res, next) => {
  // OLD: /api/products → NEW: /api/listings
  // Both continue to work via alias in server.js

  // OLD: Expecting price/stock fields only
  // NEW: Also return type, externalLink, etc.
  // Solution: Return ALL fields; frontend checks type to display appropriately

  // OLD: Product model without new fields
  // NEW: New fields have defaults, so migration works seamlessly

  next();
};

/**
 * CHECKLIST BEFORE RUNNING MIGRATION
 */

const migrationChecklist = `
✓ Backup your MongoDB database
✓ Test schema changes on development environment first
✓ Ensure all team members are using updated code
✓ Update API documentation with new fields
✓ Create migration script (see above)
✓ Run: node scripts/migrate-schema.js
✓ Verify sample products have correct structure
✓ Test ListingDetail component renders all types
✓ Test admin panel conditional fields
✓ Monitor logs for any errors post-migration
✓ Update frontend components to handle new fields
✓ Test affiliate link tracking
✓ Test job application links
✓ Test cart for products
✓ Monitor database performance (new indexes)
✓ Roll back backup if any issues
`;

console.log(migrationChecklist);
