// routes/cart.js
const express = require('express');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { protect } = require('../middleware/auth');
const router = express.Router();

// Get user's cart
router.get('/', protect, async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id })
      .populate('items.product', 'title price images stock')
      .populate('user', 'name email');

    if (!cart) {
      // Create a new cart if it doesn't exist
      cart = new Cart({
        user: req.user._id,
        items: []
      });
      await cart.save();
      await cart.populate('items.product', 'title price images stock');
      await cart.populate('user', 'name email');
    }

    res.json({
      success: true,
      data: cart
    });
  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch cart',
      error: error.message
    });
  }
});

// Add item to cart
router.post('/items', protect, async (req, res) => {
  try {
    const { productId, quantity = 1, productTitle, price, productLink, productImage } = req.body;

    // Find or create cart
    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      cart = new Cart({
        user: req.user._id,
        items: []
      });
    }

    // If a productId was provided, try to add the referenced product
    if (productId) {
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ success: false, message: 'Product not found' });
      }

      // Check stock availability
      if (product.stock < quantity) {
        return res.status(400).json({ success: false, message: `Only ${product.stock} items available in stock` });
      }

      // Add existing product reference
      cart.addItem(product, quantity);
    } else {
      // No productId -> treat as external item (job/tool/offer)
      // Require at least a title
      const title = productTitle || req.body.title;
      if (!title) {
        return res.status(400).json({ success: false, message: 'External item title is required' });
      }

      const itemPrice = Number(price) || 0;
      const qty = Number(quantity) || 1;

      // Push external item (product left null)
      cart.items.push({
        product: null,
        quantity: qty,
        price: itemPrice,
        total: itemPrice * qty,
        productLink: productLink || null,
        productTitle: title,
        productImage: productImage || null
      });
    }

    await cart.save();
    // Populate only existing product refs
    await cart.populate('items.product', 'title price images stock');

    res.status(201).json({ success: true, message: 'Item added to cart successfully', data: cart });
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add item to cart',
      error: error.message
    });
  }
});

// Update item quantity in cart
router.put('/items/:productId', protect, async (req, res) => {
  try {
    const { productId } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 0) {
      return res.status(400).json({ success: false, message: 'Valid quantity is required' });
    }

    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    // Try to treat productId as a Product first
    const product = await Product.findById(productId);
    if (product) {
      // Check stock availability
      if (product.stock < quantity) {
        return res.status(400).json({ success: false, message: `Only ${product.stock} items available in stock` });
      }
      cart.updateItemQuantity(productId, quantity);
    } else {
      // Treat productId as a cart item _id for external items
      const item = cart.items.id(productId);
      if (!item) {
        return res.status(404).json({ success: false, message: 'Cart item not found' });
      }
      if (quantity <= 0) {
        // remove
        cart.items.id(productId).remove();
      } else {
        cart.items.id(productId).quantity = quantity;
        cart.items.id(productId).total = cart.items.id(productId).price * quantity;
      }
    }

    await cart.save();
    await cart.populate('items.product', 'title price images stock');

    res.json({ success: true, message: 'Cart updated successfully', data: cart });
  } catch (error) {
    console.error('Update cart error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update cart',
      error: error.message
    });
  }
});

// Remove item from cart
router.delete('/items/:productId', protect, async (req, res) => {
  try {
    const { productId } = req.params;

    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    // Try to remove by Product reference first
    const product = await Product.findById(productId);
    if (product) {
      cart.removeItem(productId);
    } else {
      // Otherwise treat productId as cart item _id
      const item = cart.items.id(productId);
      if (!item) {
        return res.status(404).json({ success: false, message: 'Cart item not found' });
      }
      item.remove();
    }

    await cart.save();
    await cart.populate('items.product', 'title price images stock');

    res.json({ success: true, message: 'Item removed from cart successfully', data: cart });
  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove item from cart',
      error: error.message
    });
  }
});

// Clear cart
router.delete('/', protect, async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    // Clear all items from cart
    cart.clearCart();
    await cart.save();

    res.json({
      success: true,
      message: 'Cart cleared successfully',
      data: cart
    });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear cart',
      error: error.message
    });
  }
});

// Get cart count (number of items)
router.get('/count', protect, async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    
    const itemCount = cart ? cart.items.reduce((total, item) => total + item.quantity, 0) : 0;

    res.json({
      success: true,
      data: {
        count: itemCount
      }
    });
  } catch (error) {
    console.error('Get cart count error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get cart count',
      error: error.message
    });
  }
});

// Apply coupon to cart
router.post('/coupon', protect, async (req, res) => {
  try {
    const { couponCode } = req.body;

    if (!couponCode) {
      return res.status(400).json({
        success: false,
        message: 'Coupon code is required'
      });
    }

    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    // In a real application, you would validate the coupon code against a database
    // For now, we'll use a simple example
    const validCoupons = {
      'WELCOME10': 10, // $10 discount
      'SAVE20': 20,    // $20 discount
      'FREESHIP': 5    // Free shipping (assuming shipping is $5)
    };

    const discount = validCoupons[couponCode.toUpperCase()];

    if (discount === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Invalid coupon code'
      });
    }

    // Apply coupon
    cart.applyCoupon(couponCode.toUpperCase(), discount);
    await cart.save();
    await cart.populate('items.product', 'title price images stock');

    res.json({
      success: true,
      message: 'Coupon applied successfully',
      data: cart
    });
  } catch (error) {
    console.error('Apply coupon error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to apply coupon',
      error: error.message
    });
  }
});

// Remove coupon from cart
router.delete('/coupon', protect, async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    // Remove coupon
    cart.removeCoupon();
    await cart.save();
    await cart.populate('items.product', 'title price images stock');

    res.json({
      success: true,
      message: 'Coupon removed successfully',
      data: cart
    });
  } catch (error) {
    console.error('Remove coupon error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove coupon',
      error: error.message
    });
  }
});

module.exports = router;