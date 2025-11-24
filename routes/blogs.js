const express = require('express');
const Blog = require('../models/Blog');
const Product = require('../models/Product');
const { protect, admin } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { deleteFromCloudinary } = require('../middleware/uploadUtils');

const router = express.Router();

// Get all blogs with filtering and pagination
router.get('/', async (req, res) => {
  try {
    console.log('=== GET BLOGS REQUEST ===');
    console.log('Query params:', req.query);
    
    const pageSize = parseInt(req.query.pageSize) || parseInt(req.query.limit) || 9;
    const page = parseInt(req.query.page) || parseInt(req.query.pageNumber) || 1;
    const category = req.query.category;
    const tag = req.query.tag;
    const featured = req.query.featured;
    const search = req.query.search;
    const status = req.query.status || 'published';

    // Build query
    let query = { isActive: true };

    if (status !== 'all') {
      query.status = status;
    }

    if (category && category !== 'all') {
      query.category = category;
    }

    if (tag && tag !== 'all') {
      query.tags = { $in: [tag] };
    }

    if (featured === 'true') {
      query.featured = true;
    }

    if (search && search.trim() !== '') {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { excerpt: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    console.log('Final query:', JSON.stringify(query, null, 2));

    const count = await Blog.countDocuments(query);
    const blogs = await Blog.find(query)
      .populate('author', 'name email')
      .populate('category', 'name')
      .populate('relatedProducts', 'title images price slug')
      .sort({ createdAt: -1 })
      .limit(pageSize)
      .skip(pageSize * (page - 1));

    // Re-generate processedContent for each blog before sending (fix older posts)
    try {
      for (const b of blogs) {
        try {
          b.processedContent = b.generateProcessedContent();
        } catch (err) {
          console.warn('Failed to regenerate processedContent for blog', b._id, err.message);
        }
      }
    } catch (err) {
      console.warn('Error while regenerating processedContent for blogs list:', err.message);
    }

    console.log(`Found ${blogs.length} blogs out of ${count} total`);

    res.json({
      blogs,
      page,
      pages: Math.ceil(count / pageSize),
      total: count,
      hasNext: page < Math.ceil(count / pageSize),
      hasPrev: page > 1
    });
  } catch (error) {
    console.error('Error in GET /blogs:', error);
    res.status(500).json({ 
      message: 'Failed to fetch blogs',
      error: error.message 
    });
  }
});

// Get single blog by slug
router.get('/:slug', async (req, res) => {
  try {
    console.log('Getting blog by slug:', req.params.slug);
    
    const blog = await Blog.findOne({ 
      slug: req.params.slug,
      isActive: true 
    })
      .populate('author', 'name email avatar')
      .populate('category', 'name slug')
      .populate('relatedProducts', 'title images price slug')
      .populate('comments.user', 'name email avatar')
      .populate('comments.replies.user', 'name email avatar');

    if (blog) {
      console.log('Blog found, incrementing views');
      console.log('📝 Blog contentImages:', blog.contentImages);

      // Re-generate processedContent on read to fix older posts with broken HTML
      try {
        blog.processedContent = blog.generateProcessedContent();
        console.log('🔧 Re-generated processedContent for sending');
      } catch (err) {
        console.warn('Failed to re-generate processedContent on read:', err.message);
      }

      // Increment views
      blog.views = (blog.views || 0) + 1;
      await blog.save();

      console.log('📤 Sending blog to client with contentImages:', blog.contentImages);
      res.json(blog);
    } else {
      console.log('Blog not found with slug:', req.params.slug);
      res.status(404).json({ message: 'Blog not found' });
    }
  } catch (error) {
    console.error('Error in GET /blogs/:slug:', error);
    res.status(500).json({ 
      message: 'Failed to fetch blog',
      error: error.message 
    });
  }
});

// Get blog by ID
router.get('/id/:id', async (req, res) => {
  try {
    const blog = await Blog.findOne({ 
      _id: req.params.id,
      isActive: true 
    })
      .populate('author', 'name email avatar')
      .populate('category', 'name slug')
      .populate('relatedProducts', 'title images price slug');

    if (blog) {
      res.json(blog);
    } else {
      res.status(404).json({ message: 'Blog not found' });
    }
  } catch (error) {
    console.error('Error in GET /blogs/id/:id:', error);
    res.status(500).json({ 
      message: 'Failed to fetch blog',
      error: error.message 
    });
  }
});

// Get popular blogs
router.get('/featured/popular', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 6;
    
    const popularBlogs = await Blog.find({ 
      status: 'published', 
      isActive: true 
    })
      .populate('author', 'name')
      .populate('category', 'name')
      .sort({ views: -1, likesCount: -1, createdAt: -1 })
      .limit(limit);

    console.log(`Found ${popularBlogs.length} popular blogs`);
    
    res.json(popularBlogs);
  } catch (error) {
    console.error('Error in GET /blogs/featured/popular:', error);
    res.status(500).json({ 
      message: 'Failed to fetch popular blogs',
      error: error.message 
    });
  }
});

// Get featured blogs
router.get('/featured/featured', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 6;
    
    const featuredBlogs = await Blog.find({ 
      featured: true,
      status: 'published', 
      isActive: true 
    })
      .populate('author', 'name')
      .populate('category', 'name')
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json(featuredBlogs);
  } catch (error) {
    console.error('Error in GET /blogs/featured/featured:', error);
    res.status(500).json({ 
      message: 'Failed to fetch featured blogs',
      error: error.message 
    });
  }
});

// Get blog categories and tags
router.get('/meta/categories-tags', async (req, res) => {
  try {
    const categories = await Blog.aggregate([
      { $match: { status: 'published', isActive: true, category: { $ne: null } } },
      { $group: { _id: '$category' } },
      { $lookup: {
          from: 'categories',
          localField: '_id',
          foreignField: '_id',
          as: 'categoryInfo'
        }
      },
      { $unwind: '$categoryInfo' },
      { $project: { 
          _id: '$categoryInfo._id',
          name: '$categoryInfo.name',
          slug: '$categoryInfo.slug'
        }
      }
    ]);

    const tags = await Blog.aggregate([
      { $match: { status: 'published', isActive: true, tags: { $ne: null } } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags' } },
      { $project: { name: '$_id', _id: 0 } },
      { $limit: 50 }
    ]);

    const tagNames = tags.map(tag => tag.name).filter(tag => tag && tag.trim() !== '');
    
    res.json({
      categories,
      tags: tagNames
    });
  } catch (error) {
    console.error('Error in GET /blogs/meta/categories-tags:', error);
    res.status(500).json({ 
      message: 'Failed to fetch blog meta data',
      error: error.message 
    });
  }
});

// ✅ FIXED: Create blog with IMPROVED content image handling
router.post('/', protect, upload.fields([
  { name: 'featuredImage', maxCount: 1 },
  { name: 'contentImages', maxCount: 20 }
]), async (req, res) => {
  try {
    console.log('=== BLOG CREATION REQUEST START ===');
    console.log('User:', req.user._id, req.user.name);
    console.log('Request body keys:', Object.keys(req.body));
    console.log('Request files:', req.files ? {
      featuredImage: req.files['featuredImage'] ? req.files['featuredImage'].length : 0,
      contentImages: req.files['contentImages'] ? req.files['contentImages'].length : 0
    } : 'No files');

    const {
      title,
      excerpt,
      content,
      category,
      relatedProducts,
      tags,
      metaTitle,
      metaDescription,
      status = 'draft',
      featured = false
    } = req.body;

    // Validate required fields
    if (!title || !title.trim()) {
      return res.status(400).json({ message: 'Title is required' });
    }

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Content is required' });
    }

    if (!req.files || !req.files['featuredImage']) {
      return res.status(400).json({ message: 'Featured image is required' });
    }

    // Handle featured image
    const featuredImageFile = req.files['featuredImage'][0];
    const featuredImage = {
      url: featuredImageFile.path,
      public_id: featuredImageFile.filename
    };

    // ✅ FIXED: IMPROVED content images handling with better placeholder tracking
    let contentImages = [];
    let updatedContent = content.trim();
    
    if (req.files['contentImages'] && Array.isArray(req.files['contentImages'])) {
      console.log('📸 Backend received content images:', req.files['contentImages'].length);

      // Get placeholders mapping from client
      let placeholders = [];
      if (req.body.contentImagePlaceholders) {
        try {
          placeholders = JSON.parse(req.body.contentImagePlaceholders);
          console.log('📝 Received placeholders from client:', placeholders);
        } catch (err) {
          console.warn('Failed to parse contentImagePlaceholders:', err.message);
        }
      }

      let contentImagesAlts = [];
      if (req.body.contentImagesAlts) {
        try {
          contentImagesAlts = JSON.parse(req.body.contentImagesAlts);
          console.log('📝 Received alt texts from client:', contentImagesAlts);
        } catch (err) {
          console.warn('Failed to parse contentImagesAlts:', err.message);
        }
      }

      req.files['contentImages'].forEach((file, index) => {
        const publicId = file.filename;
        const url = file.path;
        const placeholderId = placeholders[index];

        console.log(`🖼️ Processing image ${index + 1}:`, {
          placeholderId,
          publicId,
          hasPlaceholder: !!placeholderId
        });

        // Get alt text
        let altText = 'Blog image';
        if (Array.isArray(contentImagesAlts) && contentImagesAlts[index]) {
          altText = contentImagesAlts[index];
        }

        // ✅ CRITICAL FIX: Replace the temporary placeholder with permanent one
        if (placeholderId && updatedContent) {
          const temporaryPlaceholder = `![${altText}](image:${placeholderId})`;
          const permanentPlaceholder = `![${altText}](image:${publicId})`;
          
          console.log(`🔄 Replacing: "${temporaryPlaceholder}" → "${permanentPlaceholder}"`);
          
          // Escape special characters for regex
          const escapedTemporary = temporaryPlaceholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(escapedTemporary, 'g');
          updatedContent = updatedContent.replace(regex, permanentPlaceholder);
          
          console.log(`✅ Successfully replaced placeholder for image ${index + 1}`);
        }

        contentImages.push({
          url,
          public_id: publicId,
          alt: altText,
          placeholder: `![${altText}](image:${publicId})`,
          position: index
        });
      });
    }

    // Parse arrays safely
    let parsedRelatedProducts = [];
    let parsedTags = [];
    
    if (relatedProducts && relatedProducts.trim() !== '') {
      try {
        parsedRelatedProducts = JSON.parse(relatedProducts);
        if (!Array.isArray(parsedRelatedProducts)) {
          parsedRelatedProducts = [];
        }
      } catch (error) {
        console.warn('Failed to parse relatedProducts, using empty array');
      }
    }

    if (tags && tags.trim() !== '') {
      try {
        parsedTags = JSON.parse(tags);
        if (!Array.isArray(parsedTags)) {
          parsedTags = tags.split(',').map(tag => tag.trim()).filter(tag => tag !== '');
        }
      } catch (error) {
        parsedTags = tags.split(',').map(tag => tag.trim()).filter(tag => tag !== '');
      }
    }

    // Create blog data - ✅ REMOVED manual processedContent generation
    const blogData = {
      title: title.trim(),
      excerpt: excerpt ? excerpt.trim() : generateExcerpt(updatedContent, 150),
      content: updatedContent,
      category: category || null,
      relatedProducts: parsedRelatedProducts,
      tags: parsedTags,
      metaTitle: metaTitle || title.trim(),
      metaDescription: metaDescription || (excerpt ? excerpt.trim() : generateExcerpt(content, 160)),
      status: status,
      featured: featured === true || featured === 'true',
      featuredImage: featuredImage,
      contentImages: contentImages,
      author: req.user._id
    };

    console.log('Creating blog with data:', {
      title: blogData.title,
      status: blogData.status,
      featured: blogData.featured,
      tagsCount: blogData.tags.length,
      contentImagesCount: blogData.contentImages.length,
      contentLength: blogData.content.length
    });
    
    const blog = new Blog(blogData);
    const createdBlog = await blog.save(); // ✅ Let the model's pre-save hook generate processedContent
    
    await createdBlog.populate('author', 'name email');
    await createdBlog.populate('category', 'name');
    
    console.log('=== BLOG CREATION SUCCESS ===');
    console.log('Blog created with ID:', createdBlog._id);
    console.log('Slug:', createdBlog.slug);
    console.log('Content images saved:', createdBlog.contentImages.length);
    console.log('Processed content generated:', !!createdBlog.processedContent);
    console.log('Processed content length:', createdBlog.processedContent?.length);
    
    res.status(201).json(createdBlog);
  } catch (error) {
    console.error('=== BLOG CREATION ERROR ===');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Delete uploaded files on error
    if (req.files) {
      try {
        const deletePromises = [];
        
        if (req.files['featuredImage']) {
          req.files['featuredImage'].forEach(file => {
            deletePromises.push(deleteFromCloudinary(file.filename));
          });
        }
        
        if (req.files['contentImages']) {
          req.files['contentImages'].forEach(file => {
            deletePromises.push(deleteFromCloudinary(file.filename));
          });
        }
        
        await Promise.all(deletePromises);
        console.log('Cleaned up uploaded files due to error');
      } catch (deleteError) {
        console.error('Error deleting uploaded files:', deleteError);
      }
    }
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: errors 
      });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: 'Blog with this title already exists' 
      });
    }
    
    res.status(500).json({ 
      message: 'Failed to create blog',
      error: error.message 
    });
  }
});

// ✅ FIXED: Update blog with IMPROVED content image handling
router.put('/:id', protect, upload.fields([
  { name: 'featuredImage', maxCount: 1 },
  { name: 'contentImages', maxCount: 20 }
]), async (req, res) => {
  try {
    console.log('=== BLOG UPDATE REQUEST ===');
    console.log('Blog ID:', req.params.id);
    console.log('User:', req.user._id);
    console.log('Request body keys:', Object.keys(req.body));
    console.log('Request files:', req.files ? {
      featuredImage: req.files['featuredImage'] ? req.files['featuredImage'].length : 0,
      contentImages: req.files['contentImages'] ? req.files['contentImages'].length : 0
    } : 'No files');
    
    const blog = await Blog.findById(req.params.id);
    
    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    // Check if user is author or admin
    if (blog.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to update this blog' });
    }

    const oldFeaturedImagePublicId = blog.featuredImage?.public_id;
    const oldContentImages = [...blog.contentImages];
    
    // Update basic fields
    if (req.body.title) blog.title = req.body.title;
    if (req.body.excerpt) blog.excerpt = req.body.excerpt;
    if (req.body.content) blog.content = req.body.content;
    if (req.body.category) blog.category = req.body.category;
    if (req.body.metaTitle) blog.metaTitle = req.body.metaTitle;
    if (req.body.metaDescription) blog.metaDescription = req.body.metaDescription;
    if (req.body.status) blog.status = req.body.status;
    
    if ('featured' in req.body) {
      blog.featured = req.body.featured === 'true' || req.body.featured === true;
    }

    // Parse arrays if they exist
    if (req.body.relatedProducts) {
      try {
        blog.relatedProducts = JSON.parse(req.body.relatedProducts);
      } catch (error) {
        console.warn('Failed to parse relatedProducts, keeping existing');
      }
    }

    if (req.body.tags) {
      try {
        blog.tags = JSON.parse(req.body.tags);
      } catch (error) {
        blog.tags = req.body.tags.split(',').map(tag => tag.trim()).filter(tag => tag !== '');
      }
    }

    // Handle deleted featured images
    if (req.body.deletedFeaturedImages) {
      try {
        const deletedFeaturedIds = JSON.parse(req.body.deletedFeaturedImages);
        console.log('🗑️ Deleting featured images:', deletedFeaturedIds);
        for (const publicId of deletedFeaturedIds) {
          await deleteFromCloudinary(publicId);
        }
        // Clear featured image if it was deleted
        if (deletedFeaturedIds.includes(blog.featuredImage?.public_id)) {
          blog.featuredImage = null;
        }
      } catch (error) {
        console.error('Error parsing deletedFeaturedImages:', error);
      }
    }

    // Handle deleted content images
    if (req.body.deletedContentImages) {
      try {
        const deletedContentIds = JSON.parse(req.body.deletedContentImages);
        console.log('🗑️ Deleting specific content images:', deletedContentIds);
        
        // Delete from Cloudinary
        for (const publicId of deletedContentIds) {
          await deleteFromCloudinary(publicId);
        }
        
        // Remove ONLY the specified images from contentImages array
        blog.contentImages = blog.contentImages.filter(img => !deletedContentIds.includes(img.public_id));
        console.log('✅ Content images after deletion:', blog.contentImages.length);
        
      } catch (error) {
        console.error('Error parsing deletedContentImages:', error);
      }
    }

    // Handle featured image update
    if (req.files && req.files['featuredImage']) {
      const featuredImageFile = req.files['featuredImage'][0];
      blog.featuredImage = {
        url: featuredImageFile.path,
        public_id: featuredImageFile.filename
      };
      
      // Delete old featured image from Cloudinary
      if (oldFeaturedImagePublicId) {
        await deleteFromCloudinary(oldFeaturedImagePublicId);
      }
    }

    // ✅ FIXED: IMPROVED content images update handling
    if (req.files && req.files['contentImages']) {
      console.log('📸 UPDATE: Received new content images:', req.files['contentImages'].length);

      // Parse placeholders mapping sent by client
      let placeholders = [];
      if (req.body.contentImagePlaceholders) {
        try {
          placeholders = JSON.parse(req.body.contentImagePlaceholders);
          console.log('📝 Received placeholders for update:', placeholders);
        } catch (err) {
          console.warn('Failed to parse contentImagePlaceholders:', err.message);
        }
      }

      const newContentImages = [];
      req.files['contentImages'].forEach((file, index) => {
        const publicId = file.filename;
        const url = file.path;
        const placeholderId = placeholders[index];

        // Try to extract alt from current content
        let altText = 'Blog image';
        if (placeholderId && blog.content) {
          const altMatch = blog.content.match(new RegExp(`!\\[([^\\]]*)\\]\\(image:${placeholderId}\\)`));
          if (altMatch && altMatch[1]) altText = altMatch[1];
        }
        // Parse alts for updates if provided
        let updateContentImagesAlts = [];
        if (req.body.contentImagesAlts) {
          try {
            updateContentImagesAlts = JSON.parse(req.body.contentImagesAlts);
          } catch (err) {
            console.warn('Failed to parse contentImagesAlts for update:', err.message);
          }
        }
        if ((!altText || altText === 'Blog image') && Array.isArray(updateContentImagesAlts) && updateContentImagesAlts[index]) {
          altText = updateContentImagesAlts[index];
        }

        // ✅ FIXED: Create consistent placeholder format
        const finalPlaceholder = `![${altText}](image:${publicId})`;
        
        console.log(`🖼️ Update image ${index + 1} final placeholder: "${finalPlaceholder}"`);

        // Replace placeholder in blog.content with public id
        if (placeholderId && blog.content) {
          console.log(`🔄 Replacing temporary placeholder "${placeholderId}" with final placeholder`);
          const placeholderRegex = new RegExp(`!\\[[^\\]]*\\]\\(image:${placeholderId}\\)`, 'g');
          blog.content = blog.content.replace(placeholderRegex, finalPlaceholder);
        }

        newContentImages.push({
          url,
          public_id: publicId,
          alt: altText,
          placeholder: finalPlaceholder, // ✅ Store the exact placeholder format
          position: blog.contentImages.length + index
        });
      });

      // Check if we should replace all content images or just add new ones
      if (req.body.replaceAllContentImages === 'true') {
        console.log('🔄 Replacing all content images');
        // Delete all old content images from Cloudinary
        for (const oldImage of oldContentImages) {
          await deleteFromCloudinary(oldImage.public_id);
        }
        blog.contentImages = newContentImages;
      } else {
        console.log('➕ Adding new content images to existing ones');
        // Add new images to existing ones
        blog.contentImages = [...blog.contentImages, ...newContentImages];
      }
      console.log('📸 UPDATE: Total content images after update:', blog.contentImages.length);
    }

    // Handle content image URLs from frontend (for existing images)
    if (req.body.contentImageUrls) {
      try {
        const existingUrls = JSON.parse(req.body.contentImageUrls);
        console.log('📷 Processing existing content image URLs:', existingUrls.length);
        
        if (req.body.replaceAllContentImages !== 'true') {
          // Merge existing URLs with current content images, avoiding duplicates
          existingUrls.forEach(existingImg => {
            const exists = blog.contentImages.some(img => img.public_id === existingImg.public_id);
            if (!exists && existingImg.public_id) {
              blog.contentImages.push({
                url: existingImg.url,
                public_id: existingImg.public_id,
                alt: existingImg.alt || 'Blog content image',
                placeholder: `![${existingImg.alt || 'Blog image'}](image:${existingImg.public_id})`,
                position: blog.contentImages.length
              });
            }
          });
        }
      } catch (error) {
        console.warn('Failed to parse contentImageUrls:', error);
      }
    }

    // ✅ FIXED: Let the model's pre-save hook handle processedContent generation
    const updatedBlog = await blog.save();
    
    await updatedBlog.populate('author', 'name email');
    await updatedBlog.populate('category', 'name');
    await updatedBlog.populate('relatedProducts', 'title images price slug');

    console.log('✅ Blog updated successfully:', updatedBlog._id);
    console.log('📊 Final content images count:', updatedBlog.contentImages.length);
    console.log('✅ Processed content regenerated:', !!updatedBlog.processedContent);
    console.log('📝 Processed content length:', updatedBlog.processedContent?.length);
    
    res.json(updatedBlog);
  } catch (error) {
    console.error('❌ Blog update error:', error);
    
    // Delete any uploaded files if error occurs
    if (req.files) {
      try {
        const deletePromises = [];
        
        if (req.files['featuredImage']) {
          req.files['featuredImage'].forEach(file => {
            deletePromises.push(deleteFromCloudinary(file.filename));
          });
        }
        
        if (req.files['contentImages']) {
          req.files['contentImages'].forEach(file => {
            deletePromises.push(deleteFromCloudinary(file.filename));
          });
        }
        
        await Promise.all(deletePromises);
        console.log('🧹 Cleaned up uploaded files due to error');
      } catch (deleteError) {
        console.error('Error deleting uploaded files:', deleteError);
      }
    }
    
    res.status(400).json({ 
      message: 'Failed to update blog',
      error: error.message 
    });
  }
});

// Delete specific content image from blog
router.delete('/:id/content-images/:publicId', protect, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    
    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    // Check if user is author or admin
    if (blog.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to update this blog' });
    }

    const { publicId } = req.params;
    
    // Find the image to delete
    const imageIndex = blog.contentImages.findIndex(img => img.public_id === publicId);
    
    if (imageIndex === -1) {
      return res.status(404).json({ message: 'Content image not found' });
    }

    // Remove image from array
    const removedImage = blog.contentImages.splice(imageIndex, 1)[0];
    
    // Delete image from Cloudinary
    await deleteFromCloudinary(publicId);
    
    await blog.save();
    
    res.json({ 
      message: 'Content image deleted successfully',
      deletedImage: removedImage,
      remainingImages: blog.contentImages.length
    });
  } catch (error) {
    console.error('Content image deletion error:', error);
    res.status(500).json({ 
      message: 'Failed to delete content image',
      error: error.message 
    });
  }
});

// Get content images for a blog
router.get('/:id/content-images', protect, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    
    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    res.json({
      contentImages: blog.contentImages,
      count: blog.contentImages.length
    });
  } catch (error) {
    console.error('Error fetching content images:', error);
    res.status(500).json({ 
      message: 'Failed to fetch content images',
      error: error.message 
    });
  }
});

// Toggle like on blog
router.post('/:id/like', protect, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    
    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    if (blog.status !== 'published' || !blog.isActive) {
      return res.status(400).json({ message: 'Blog is not published' });
    }

    const userId = req.user._id;
    const likeIndex = blog.likes.indexOf(userId);
    
    if (likeIndex === -1) {
      // Add like
      blog.likes.push(userId);
      blog.likesCount = blog.likes.length;
    } else {
      // Remove like
      blog.likes.splice(likeIndex, 1);
      blog.likesCount = blog.likes.length;
    }
    
    await blog.save();
    
    res.json({
      likes: blog.likes,
      likesCount: blog.likesCount,
      hasLiked: likeIndex === -1
    });
  } catch (error) {
    console.error('Like toggle error:', error);
    res.status(400).json({ 
      message: 'Failed to toggle like',
      error: error.message 
    });
  }
});

// Add comment to blog
router.post('/:id/comments', protect, async (req, res) => {
  try {
    const { comment } = req.body;
    const blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    if (blog.status !== 'published' || !blog.isActive) {
      return res.status(400).json({ message: 'Blog is not published' });
    }

    if (!comment || !comment.trim()) {
      return res.status(400).json({ message: 'Comment is required' });
    }

    const newComment = {
      user: req.user._id,
      comment: comment.trim(),
      createdAt: new Date()
    };

    blog.comments.push(newComment);
    await blog.save();
    
    // Populate the newly added comment
    await blog.populate('comments.user', 'name email avatar');
    const populatedComment = blog.comments[blog.comments.length - 1];
    
    res.status(201).json(populatedComment);
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(400).json({ 
      message: 'Failed to add comment',
      error: error.message 
    });
  }
});

// Get blogs by author
router.get('/author/my-blogs', protect, async (req, res) => {
  try {
    const pageSize = parseInt(req.query.pageSize) || 10;
    const page = parseInt(req.query.page) || 1;
    const status = req.query.status || 'all';

    let query = { author: req.user._id, isActive: true };
    
    if (status !== 'all') {
      query.status = status;
    }

    const count = await Blog.countDocuments(query);
    const blogs = await Blog.find(query)
      .populate('category', 'name')
      .populate('author', 'name email')
      .sort({ createdAt: -1 })
      .limit(pageSize)
      .skip(pageSize * (page - 1));

    res.json({
      blogs,
      page,
      pages: Math.ceil(count / pageSize),
      total: count,
      hasNext: page < Math.ceil(count / pageSize),
      hasPrev: page > 1
    });
  } catch (error) {
    console.error('Error in GET /blogs/author/my-blogs:', error);
    res.status(500).json({ 
      message: 'Failed to fetch author blogs',
      error: error.message 
    });
  }
});

// Get all blogs for admin
router.get('/admin/all-blogs', protect, admin, async (req, res) => {
  try {
    const pageSize = parseInt(req.query.pageSize) || 15;
    const page = parseInt(req.query.page) || 1;
    const status = req.query.status;

    let query = { isActive: true };
    if (status && status !== 'all') {
      query.status = status;
    }

    const count = await Blog.countDocuments(query);
    const blogs = await Blog.find(query)
      .populate('author', 'name email')
      .populate('category', 'name')
      .sort({ createdAt: -1 })
      .limit(pageSize)
      .skip(pageSize * (page - 1));

    res.json({
      blogs,
      page,
      pages: Math.ceil(count / pageSize),
      total: count,
      hasNext: page < Math.ceil(count / pageSize),
      hasPrev: page > 1
    });
  } catch (error) {
    console.error('Error in GET /blogs/admin/all-blogs:', error);
    res.status(500).json({ 
      message: 'Failed to fetch admin blogs',
      error: error.message 
    });
  }
});

// Delete blog
router.delete('/:id', protect, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    
    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    // Check if user is author or admin
    if (blog.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to delete this blog' });
    }

    // Delete images from Cloudinary
    try {
      if (blog.featuredImage && blog.featuredImage.public_id) {
        await deleteFromCloudinary(blog.featuredImage.public_id);
      }
      
      for (const contentImage of blog.contentImages) {
        if (contentImage.public_id) {
          await deleteFromCloudinary(contentImage.public_id);
        }
      }
    } catch (cloudinaryError) {
      console.error('Error deleting images from Cloudinary:', cloudinaryError);
    }
    
    // Hard delete the blog
    await Blog.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Blog deleted successfully' });
  } catch (error) {
    console.error('Blog deletion error:', error);
    res.status(500).json({ 
      message: 'Failed to delete blog',
      error: error.message 
    });
  }
});

// Helper function to generate excerpt
function generateExcerpt(content, maxLength = 150) {
  if (!content) return '';
  const plainText = content.replace(/<[^>]*>/g, '');
  if (plainText.length <= maxLength) return plainText;
  return plainText.substring(0, maxLength).trim() + '...';
}

module.exports = router;