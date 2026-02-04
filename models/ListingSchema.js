/**
 * BACKEND SCHEMA UPDATES
 * 
 * File: server/ecommerce-backend/models/Product.js
 * 
 * Extend the Product schema to support:
 * - Multiple listing types (tool, job, product)
 * - Affiliate tracking
 * - Dynamic pricing models
 * - Platform support for tools
 */

const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema(
  {
    // ========== CORE LISTING INFO ==========
    title: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    slug: {
      type: String,
      unique: true,
      sparse: true
    },
    description: {
      type: String,
      required: true
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true
    },
    
    // ========== LISTING TYPE SYSTEM ==========
    type: {
      type: String,
      enum: ['product', 'tool', 'job'],
      default: 'product',
      index: true,
      description: 'Determines behavior: product=cart, tool/job=affiliate'
    },
    
    // ========== IMAGES & MEDIA ==========
    images: [
      {
        url: String,
        publicId: String
      }
    ],
    
    // ========== PRICING (Products only, optional for tools) ==========
    price: {
      type: Number,
      default: 0,
      description: 'For products/paid tools'
    },
    originalPrice: {
      type: Number,
      default: 0
    },
    pricingType: {
      type: String,
      enum: ['free', 'paid', 'freemium'],
      default: 'paid',
      description: 'free, paid, or freemium (both free + paid tiers)'
    },
    
    // ========== INVENTORY (Products only) ==========
    stock: {
      type: Number,
      default: 0
    },
    cartEnabled: {
      type: Boolean,
      default: true,
      description: 'Whether users can add to cart (false for jobs/pure-affiliate tools)'
    },
    
    // ========== AFFILIATE & EXTERNAL LINK ==========
    externalLink: {
      type: String,
      description: 'External link for affiliate tools, job applications, or external products'
    },
    affiliateSource: {
      type: String,
      description: 'e.g., "producthunt", "appsumo", "company-website"'
    },
    affiliateId: {
      type: String,
      description: 'Affiliate ID or ref code for tracking'
    },
    
    // ========== TOOL-SPECIFIC FIELDS ==========
    platform: [
      {
        type: String,
        enum: ['web', 'windows', 'macos', 'ios', 'android', 'linux'],
        description: 'Available platforms'
      }
    ],
    features: [
      {
        type: String,
        description: 'Key features list'
      }
    ],
    integrations: [
      {
        type: String,
        description: 'Popular integrations/APIs'
      }
    ],
    
    // ========== JOB-SPECIFIC FIELDS ==========
    companyName: {
      type: String,
      description: 'Company/employer name'
    },
    jobType: {
      type: String,
      enum: ['full-time', 'part-time', 'contract', 'freelance', 'internship'],
      description: 'Employment type'
    },
    location: {
      type: String,
      description: 'Job location or "Remote"'
    },
    salary: {
      type: String,
      description: 'Salary range or "Competitive"'
    },
    experienceLevel: {
      type: String,
      enum: ['entry', 'mid', 'senior', 'any'],
      default: 'any'
    },
    applicationDeadline: {
      type: Date,
      description: 'When applications close'
    },
    
    // ========== REVIEWS & RATINGS ==========
    reviews: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true
        },
        rating: {
          type: Number,
          min: 1,
          max: 5
        },
        title: String,
        comment: String,
        createdAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    
    // ========== TAGGING & METADATA ==========
    tags: [String],
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
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft'
    },
    
    // ========== TRACKING & ANALYTICS ==========
    views: {
      type: Number,
      default: 0
    },
    clicks: {
      type: Number,
      default: 0,
      description: 'Affiliate/external link clicks'
    },
    conversions: {
      type: Number,
      default: 0,
      description: 'Add-to-cart or purchase count'
    },
    
    // ========== SEO METADATA ==========
    metaTitle: String,
    metaDescription: String,
    metaKeywords: [String],
    schema: {
      type: String,
      enum: ['SoftwareApplication', 'JobPosting', 'Product', 'none'],
      default: 'none',
      description: 'Structured data type for SEO'
    },
    
    // ========== ADMIN & PUBLISHING ==========
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      description: 'Admin who approved this listing'
    },
    approvedAt: Date,
    publishedAt: Date,
    
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

// ========== TRACKING MODEL ==========
/**
 * File: server/ecommerce-backend/models/ListingTrack.js
 * 
 * Track views and clicks for analytics
 */
const ListingTrackSchema = new mongoose.Schema(
  {
    listingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      sparse: true
    },
    eventType: {
      type: String,
      enum: ['view', 'click', 'conversion'],
      required: true,
      index: true
    },
    clickType: {
      type: String,
      enum: ['external_link', 'add_to_cart', 'buy_now', 'apply_now'],
      description: 'Specific action type'
    },
    userAgent: String,
    ipAddress: String,
    referrer: String,
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  { timestamps: false }
);

// ========== INDEXES FOR PERFORMANCE ==========
ProductSchema.index({ type: 1, isActive: 1 });
ProductSchema.index({ category: 1, isActive: 1 });
ProductSchema.index({ isFeatured: 1, isActive: 1 });
ProductSchema.index({ status: 1, isActive: 1 });
ProductSchema.index({ createdAt: -1 });
ProductSchema.index({ pricingType: 1 });

ListingTrackSchema.index({ listingId: 1, timestamp: -1 });
ListingTrackSchema.index({ eventType: 1, timestamp: -1 });
ListingTrackSchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model('Product', ProductSchema);
module.exports.ListingTrack = mongoose.model('ListingTrack', ListingTrackSchema);
