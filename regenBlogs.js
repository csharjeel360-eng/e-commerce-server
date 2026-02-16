require('dotenv').config();
const mongoose = require('mongoose');
const Blog = require('./models/Blog');

async function regenerateBlogs() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    
    console.log('Fetching all blogs...');
    const blogs = await Blog.find({});
    console.log(`Found ${blogs.length} blogs`);
    
    for (let blog of blogs) {
      console.log(`Regenerating: ${blog.title}`);
      // Trigger the pre-save hook which regenerates processedContent
      blog.markModified('content');
      await blog.save();
      console.log(`✓ Regenerated: ${blog.title}`);
    }
    
    console.log('All blogs regenerated successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

regenerateBlogs();
