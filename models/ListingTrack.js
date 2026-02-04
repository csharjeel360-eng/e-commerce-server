const mongoose = require('mongoose');

const listingTrackSchema = new mongoose.Schema({
  listingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true
  },

  listingType: {
    type: String,
    enum: ['product', 'tool', 'job'],
    default: 'product',
    index: true
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
}, {
  timestamps: true
});

// Create compound indexes for performance
listingTrackSchema.index({ listingId: 1, eventType: 1 });
listingTrackSchema.index({ listingType: 1, eventType: 1 });
listingTrackSchema.index({ timestamp: -1 });

module.exports = mongoose.model('ListingTrack', listingTrackSchema);
