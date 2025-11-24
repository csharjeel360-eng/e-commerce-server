 const mongoose = require('mongoose');

 const reviewSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  title: {
    type: String,
    required: false, // Change to false if you want it optional
    trim: true,
    default: '' // Add default value
  },
  comment: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});
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
  price: {
    type: Number,
    required: true,
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
  reviews: [reviewSchema],
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
    required: true,
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
  this.calculateAverageRating();
  next();
});

// Method to generate thumbnail URLs
productSchema.methods.generateThumbnails = function() {
  this.images = this.images.map(image => {
    if (!image.thumbnail) {
      // Generate thumbnail URL from Cloudinary public_id
      image.thumbnail = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/c_thumb,w_300,h_300/${image.public_id}`;
    }
    return image;
  });
};

module.exports = mongoose.model('Product', productSchema);