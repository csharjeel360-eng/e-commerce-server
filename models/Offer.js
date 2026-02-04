const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['cpa', 'cpc', 'cpm', 'cpv', 'revenue_share'],
    default: 'cpa',
    required: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  commission: {
    type: Number,
    required: true,
    min: 0
  },
  commissionType: {
    type: String,
    enum: ['fixed', 'percentage'],
    default: 'fixed',
    required: true
  },
  network: {
    type: String,
    trim: true,
    required: true // e.g., "CJ Affiliate", "Shareasale", "Impact", etc.
  },
  offerId: {
    type: String,
    required: true,
    unique: true
  },
  trackingUrl: {
    type: String,
    required: true
  },
  thumbnail: {
    type: String,
    required: false
  },
  images: [{
    url: String,
    publicId: String
  }],
  status: {
    type: String,
    enum: ['active', 'inactive', 'expired', 'pending'],
    default: 'active'
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: false
  },
  minimumPayouts: {
    type: Number,
    default: 0
  },
  cookieDuration: {
    type: Number,
    default: 30 // days
  },
  restrictions: {
    geoTargeting: [String], // e.g., ['US', 'UK', 'CA']
    platforms: [String], // e.g., ['web', 'mobile', 'desktop']
    trafficSources: [String], // e.g., ['organic', 'paid', 'social']
    deviceTypes: [String] // e.g., ['desktop', 'mobile', 'tablet']
  },
  payoutTerms: {
    type: String,
    enum: ['monthly', 'bi-weekly', 'weekly', 'upon-approval'],
    default: 'monthly'
  },
  stats: {
    clicks: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 },
    conversionRate: { type: Number, default: 0 },
    earnings: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 }
  },
  tags: [String],
  featured: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  listing: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: false // Optional link to a listing
  },
  metadata: {
    approvalRate: { type: Number, default: 0 },
    maxPayout: Number,
    avgOrderValue: Number,
    productCategories: [String],
    requirements: String
  }
}, {
  timestamps: true
});

// Index for frequently searched fields
offerSchema.index({ status: 1, createdAt: -1 });
offerSchema.index({ category: 1 });
offerSchema.index({ network: 1 });
offerSchema.index({ type: 1 });
offerSchema.index({ featured: 1, status: 1 });

module.exports = mongoose.model('Offer', offerSchema);
