 const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  slug: {
    type: String,
    trim: true,
    index: true
  },
  price: {
    type: Number,
    required: function() {
      return this.type === 'product';
    },
    min: 0
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  images: [{
    url: {
      type: String,
      required: true
    },
    public_id: {
      type: String,
      required: true
    },
    thumbnail: String // Optional thumbnail URL
  }],
  productLink: {
    type: String,
    required: true,
    trim: true
  },
  reviews: [mongoose.Schema.Types.Mixed],
  averageRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  buyClicks: {
    type: Number,
    default: 0
  },
  views: {
    type: Number,
    default: 0
  },
  stock: {
    type: Number,
    required: function() {
      return this.type === 'product';
    },
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  featured: {
    type: Boolean,
    default: false
  },
  tags: [String],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

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
    default: null
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

  originalPrice: {
    type: Number,
    default: null
  },

  // ============================================
  // CART CONTROL (NEW)
  // ============================================
  cartEnabled: {
    type: Boolean,
    default: true
  },

  // ============================================
  // TOOL-SPECIFIC FIELDS (NEW)
  // ============================================
  platform: {
    type: [String],
    enum: ['web', 'windows', 'macos', 'ios', 'android', 'linux'],
    default: []
  },

  features: {
    type: [String],
    default: []
  },

  integrations: {
    type: [String],
    default: []
  },

  // ============================================
  // JOB-SPECIFIC FIELDS (NEW)
  // ============================================
  companyName: {
    type: String,
    default: null
  },

  jobType: {
    type: String,
    enum: ['full-time', 'part-time', 'contract', 'freelance', 'internship'],
    default: null
  },

  location: {
    type: String,
    default: null
  },

  salary: {
    type: String,
    default: null
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

  approvedBy: {
    type: String,
    default: null
  },

  approvedAt: {
    type: Date,
    default: null
  },

  // ============================================
  // ANALYTICS TRACKING (NEW - Extended views/clicks)
  // ============================================
  clicks: {
    type: Number,
    default: 0
  },

  conversions: {
    type: Number,
    default: 0
  },

  // ============================================
  // SEO SUPPORT (NEW)
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

  schemaType: {
    type: String,
    enum: ['SoftwareApplication', 'JobPosting', 'Product', 'none'],
    default: 'none'
  }
}, {
  timestamps: true
});

productSchema.methods.calculateAverageRating = function() {
  if (this.reviews.length === 0) {
    this.averageRating = 0;
    return;
  }
  
  const sum = this.reviews.reduce((acc, review) => acc + review.rating, 0);
  this.averageRating = (sum / this.reviews.length).toFixed(1);
};

productSchema.pre('save', function(next) {
  try {
    // Calculate average rating if reviews exist
    if (this.reviews && Array.isArray(this.reviews) && this.reviews.length > 0) {
      const sum = this.reviews.reduce((acc, review) => acc + (review.rating || 0), 0);
      this.averageRating = parseFloat((sum / this.reviews.length).toFixed(1));
    } else {
      this.averageRating = 0;
    }
  } catch (err) {
    console.error('Error in pre-save hook:', err.message);
    this.averageRating = 0;
  }
  next();
});

// Method to generate thumbnail URLs
productSchema.methods.generateThumbnails = function() {
  try {
    if (!this.images || this.images.length === 0) return;
    
    this.images = this.images.map(image => {
      if (image && !image.thumbnail && image.public_id) {
        // Generate thumbnail URL from Cloudinary public_id
        image.thumbnail = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/c_thumb,w_300,h_300/${image.public_id}`;
      }
      return image;
    });
  } catch (err) {
    console.error('Error generating thumbnails:', err.message);
  }
};

// Add schema index for performance
productSchema.index({ createdBy: 1, createdAt: -1 });
productSchema.index({ type: 1, isActive: 1 });

module.exports = mongoose.model('Product', productSchema);