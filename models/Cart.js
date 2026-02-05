const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: false
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  price: {
    type: Number,
    required: true
  },
  total: {
    type: Number,
    required: true
  },
  // ✅ ADDED: Store product link for external products
  productLink: {
    type: String,
    default: null
  },
  // ✅ ADDED: Store product title for better display
  productTitle: {
    type: String,
    required: true
  },
  // ✅ ADDED: Store product image for better display
  productImage: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

const cartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  items: [cartItemSchema],
  subtotal: {
    type: Number,
    default: 0
  },
  tax: {
    type: Number,
    default: 0
  },
  shipping: {
    type: Number,
    default: 0
  },
  total: {
    type: Number,
    default: 0
  },
  coupon: {
    code: String,
    discount: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

// Calculate totals before validation to ensure numeric price/total are set
cartSchema.pre('validate', function(next) {
  this.calculateTotals();
  next();
});

// Instance method to calculate cart totals
cartSchema.methods.calculateTotals = function() {
  // Calculate subtotal from items
  this.subtotal = this.items.reduce((total, item) => {
    // Ensure price is a number (default to 0 if missing)
    const price = Number(item.price || 0);
    item.price = price;
    const qty = Number(item.quantity || 0);
    // Ensure total is numeric
    item.total = parseFloat((price * qty).toFixed(2));
    return total + (price * qty);
  }, 0);

  // Calculate tax (8% for example)
  this.tax = parseFloat((this.subtotal * 0.08).toFixed(2));

  // Calculate shipping (free over $50, otherwise $5)
  this.shipping = this.subtotal >= 50 ? 0 : 5;

  // Calculate total
  this.total = parseFloat((this.subtotal + this.tax + this.shipping - (this.coupon?.discount || 0)).toFixed(2));

  // Ensure every item has valid numeric price and total
  this.items.forEach(item => {
    item.price = Number(item.price || 0);
    item.quantity = Number(item.quantity || 1);
    item.total = parseFloat((item.price * item.quantity).toFixed(2));
  });
};

// Instance method to add item to cart
cartSchema.methods.addItem = function(product, quantity = 1) {
  const pidStr = product._id.toString();
  const existingItemIndex = this.items.findIndex(item => {
    try {
      return item.product && item.product.toString() === pidStr;
    } catch (e) {
      return false;
    }
  });

  if (existingItemIndex > -1) {
    // Update existing item quantity
    this.items[existingItemIndex].quantity += quantity;
    this.items[existingItemIndex].total = this.items[existingItemIndex].price * this.items[existingItemIndex].quantity;
  } else {
    // ✅ UPDATED: Add new item with product link and details
    this.items.push({
      product: product._id,
      quantity: quantity,
      price: product.price,
      total: product.price * quantity,
      productLink: product.productLink || null, // Store product link
      productTitle: product.title, // Store product title
      productImage: product.images?.[0]?.url || null // Store product image
    });
  }

  this.calculateTotals();
  return this;
};

// Instance method to update item quantity
cartSchema.methods.updateItemQuantity = function(productId, quantity) {
  const pidStr = productId.toString();
  const itemIndex = this.items.findIndex(item => {
    try {
      return item.product && item.product.toString() === pidStr;
    } catch (e) {
      return false;
    }
  });

  if (itemIndex > -1) {
    if (quantity <= 0) {
      // Remove item if quantity is 0 or less
      this.items.splice(itemIndex, 1);
    } else {
      // Update quantity
      this.items[itemIndex].quantity = quantity;
      this.items[itemIndex].total = this.items[itemIndex].price * quantity;
    }
    this.calculateTotals();
  }
  return this;
};

// Instance method to remove item from cart
cartSchema.methods.removeItem = function(productId) {
  const pidStr = productId.toString();
  this.items = this.items.filter(item => {
    try {
      // Keep items that don't match the product id (also keep external items with null product)
      return !(item.product && item.product.toString() === pidStr);
    } catch (e) {
      return true;
    }
  });
  this.calculateTotals();
  return this;
};

// Instance method to clear cart
cartSchema.methods.clearCart = function() {
  this.items = [];
  this.calculateTotals();
  return this;
};

// Instance method to apply coupon
cartSchema.methods.applyCoupon = function(couponCode, discountAmount) {
  this.coupon = {
    code: couponCode,
    discount: discountAmount
  };
  this.calculateTotals();
  return this;
};

// Instance method to remove coupon
cartSchema.methods.removeCoupon = function() {
  this.coupon = undefined;
  this.calculateTotals();
  return this;
};

// ✅ ADDED: Method to check if cart has external products
cartSchema.methods.hasExternalProducts = function() {
  return this.items.some(item => item.productLink !== null);
};

// ✅ ADDED: Method to get external products count
cartSchema.methods.getExternalProductsCount = function() {
  return this.items.filter(item => item.productLink !== null).length;
};

// ✅ ADDED: Method to get external products
cartSchema.methods.getExternalProducts = function() {
  return this.items.filter(item => item.productLink !== null);
};

// Static method to get cart by user ID
cartSchema.statics.findByUserId = function(userId) {
  return this.findOne({ user: userId })
    .populate('items.product', 'title price images stock productLink');
};

module.exports = mongoose.model('Cart', cartSchema);