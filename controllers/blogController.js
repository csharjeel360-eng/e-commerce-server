const Blog = require('../models/Blog');
const Product = require('../models/Product');

// Generate blog ideas based on products
const generateBlogIdeas = async () => {
  const products = await Product.find({ isActive: true })
    .populate('category')
    .limit(10);

  const ideas = products.map(product => {
    const ideas = [
      `Review: ${product.title} - Is It Worth It?`,
      `Complete Guide to Using ${product.title}`,
      `${product.title} vs Competitors: Which One Should You Choose?`,
      `Top 5 Features of ${product.title} You Didn't Know About`,
      `How to Get the Most Out of Your ${product.title}`
    ];

    return {
      product: product.title,
      category: product.category?.name,
      ideas
    };
  });

  return ideas;
};

// Get related blogs for a product
const getRelatedBlogsForProduct = async (productId, limit = 3) => {
  return await Blog.find({
    relatedProducts: productId,
    status: 'published',
    isActive: true
  })
  .populate('author', 'name')
  .limit(limit)
  .sort({ createdAt: -1 });
};

module.exports = {
  generateBlogIdeas,
  getRelatedBlogsForProduct
};