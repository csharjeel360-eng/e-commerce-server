const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  excerpt: {
    type: String,
    required: true,
    maxlength: 200
  },
  content: {
    type: String,
    required: true
  },
  processedContent: {
    type: String
  },
  featuredImage: {
    url: {
      type: String,
      required: true
    },
    public_id: {
      type: String,
      required: true
    }
  },
  contentImages: [{
    url: {
      type: String,
      required: true
    },
    public_id: {
      type: String,
      required: true
    },
    alt: {
      type: String,
      default: 'Blog image'
    },
    placeholder: {
      type: String
    },
    position: {
      type: Number,
      default: 0
    }
  }],
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  },
  relatedProducts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  tags: [{
    type: String,
    trim: true
  }],
  metaTitle: {
    type: String,
    trim: true
  },
  metaDescription: {
    type: String,
    trim: true
  },
  readTime: {
    type: Number,
    default: 0
  },
  views: {
    type: Number,
    default: 0
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  likesCount: {
    type: Number,
    default: 0
  },
  comments: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    comment: {
      type: String,
      required: true,
      trim: true
    },
    replies: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      reply: {
        type: String,
        required: true,
        trim: true
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }],
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  commentsCount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'published'
  },
  featured: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Generate slug from title
blogSchema.pre('validate', function(next) {
  if (this.title && this.isModified('title')) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-zA-Z0-9 -]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 100);
    
    if (!this.slug) {
      this.slug = `blog-${Date.now()}`;
    }
  }
  next();
});

// Add fallback slug generation
blogSchema.pre('save', function(next) {
  if (!this.slug || this.slug.trim() === '') {
    if (this.title && this.title.trim() !== '') {
      this.slug = this.title
        .toLowerCase()
        .replace(/[^a-zA-Z0-9 -]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 100);
    } else {
      this.slug = `blog-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
  }
  next();
});

// ✅ FIXED: Single pre-save hook for ALL processing
blogSchema.pre('save', function(next) {
  // Calculate read time
  if (this.isModified('content')) {
    const wordsPerMinute = 200;
    const wordCount = this.content.split(/\s+/).length;
    this.readTime = Math.ceil(wordCount / wordsPerMinute);
  }

  // Generate processedContent if content or images are modified
  if (this.isModified('content') || this.isModified('contentImages')) {
    console.log('🔄 Generating processedContent...');
    this.processedContent = this.generateProcessedContent();
    console.log('✅ processedContent generated:', {
      originalLength: this.content?.length,
      processedLength: this.processedContent?.length
    });
  }

  // Update counts
  if (this.isModified('likes')) {
    this.likesCount = this.likes.length;
  }
  if (this.isModified('comments')) {
    this.commentsCount = this.comments.length;
  }
  
  next();
});

// ✅ FIXED: IMPROVED generateProcessedContent method with BETTER image replacement
blogSchema.methods.generateProcessedContent = function() {
  let processed = this.content || '';
  
  console.log('🔄 Generating processed content...');
  console.log('Original content length:', processed.length);
  console.log('Content images count:', this.contentImages?.length);

  // Step 1: Replace image placeholders FIRST
  if (this.contentImages && this.contentImages.length > 0) {
    console.log('🖼️ Processing content images for replacement...');
    
    this.contentImages.forEach((image, index) => {
      if (image && image.public_id && image.url) {
        console.log(`📸 Processing image ${index + 1}:`, {
          public_id: image.public_id,
          url: image.url,
          alt: image.alt,
          placeholder: image.placeholder
        });

        // ✅ FIXED: Try MULTIPLE placeholder formats
        const placeholderFormats = [
          // Format 1: Standard format with public_id
          `![${image.alt || 'Blog image'}](image:${image.public_id})`,
          // Format 2: With placeholder field if exists
          image.placeholder,
          // Format 3: Try without alt text
          `![Blog image](image:${image.public_id})`,
          // Format 4: Try with different alt text format
          `![${image.alt}](image:${image.public_id})`,
          // Format 5: Try with just the public_id (fallback)
          `![](${image.public_id})`
        ];

        // Build image HTML with single-line <img> to avoid markdown post-processing splitting attributes
        const altText = (image.alt && image.alt !== 'Blog image') ? image.alt : 'Blog image';
        const captionHtml = (image.alt && image.alt !== 'Blog image') ? `<p class="text-sm text-gray-600 mt-2 italic">${image.alt}</p>` : '';
        const imageTag = `<img src="${image.url}" alt="${image.alt || 'Blog image'}" class="max-w-full h-auto rounded-lg shadow-md mx-auto" style="max-height: 500px; object-fit: contain;" loading="lazy" />`;
        const imageHtml = `<div class="blog-image-container my-6 text-center">${imageTag}${captionHtml}</div>`;

        let replaced = false;
        
        // Try each placeholder format
        for (const placeholder of placeholderFormats) {
          if (placeholder && placeholder.trim() && processed.includes(placeholder)) {
            console.log(`✅ Found placeholder to replace: "${placeholder}"`);
            
            // Escape special regex characters
            const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escapedPlaceholder, 'g');
            processed = processed.replace(regex, imageHtml);
            
            console.log(`✅ Successfully replaced image placeholder ${index + 1}`);
            replaced = true;
            break;
          }
        }

        if (!replaced) {
          console.log(`❌ No matching placeholder found for image ${index + 1}`);
          console.log(`🖼️ Image data:`, {
            public_id: image.public_id,
            placeholder: image.placeholder,
            alt: image.alt
          });
          
          // Debug: Find all image placeholders in content
          const imagePlaceholders = processed.match(/!\[.*?\]\([^)]+\)/g) || [];
          console.log('📝 All image placeholders found in content:', imagePlaceholders);
          
          // Try a more aggressive replacement - look for ANY image placeholder
          const allPlaceholders = processed.match(/!\[.*?\]\([^)]+\)/g);
          if (allPlaceholders && allPlaceholders.length > index) {
            const fallbackPlaceholder = allPlaceholders[index];
            console.log(`🔄 Attempting fallback replacement with: "${fallbackPlaceholder}"`);
            
            const escapedPlaceholder = fallbackPlaceholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escapedPlaceholder, 'g');
            processed = processed.replace(regex, imageHtml);
            console.log(`✅ Fallback replacement completed for image ${index + 1}`);
          } else {
            console.log(`⚠️ No fallback placeholder available for image ${index + 1}`);
          }
        }
      } else {
        console.log(`❌ Invalid image data for image ${index + 1}:`, {
          hasPublicId: !!image?.public_id,
          hasUrl: !!image?.url
        });
      }
    });
  } else {
    console.log('📝 No content images to process');
  }

  // Step 2: Convert markdown to HTML
  processed = this.convertMarkdownToHtml(processed);
  
  console.log('✅ Processed content generated. Length:', processed.length);
  
  // Debug: Check if images are in final output
  const imageCount = (processed.match(/<img/g) || []).length;
  console.log(`📊 Final HTML contains ${imageCount} image tags`);
  
  return processed;
};

// ✅ FIXED: IMPROVED markdown to HTML converter
blogSchema.methods.convertMarkdownToHtml = function(markdown) {
  if (!markdown) return '';
  
  let html = markdown;

  // Color tags - must come FIRST before other formatting
  html = html.replace(/\{color:(#[0-9A-Fa-f]{6}|[a-zA-Z]+)\}(.*?)\{\/color\}/g, '<span style="color: $1;">$2</span>');

  // Headers
  html = html.replace(/^# (.*$)/gim, '<h1 class="text-3xl font-bold my-6 text-gray-900">$1</h1>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="text-2xl font-bold my-5 text-gray-800">$1</h2>');
  html = html.replace(/^### (.*$)/gim, '<h3 class="text-xl font-bold my-4 text-gray-700">$1</h3>');
  html = html.replace(/^#### (.*$)/gim, '<h4 class="text-lg font-bold my-3 text-gray-600">$1</h4>');
  
  // Bold and Italic
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-gray-900">$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em class="italic text-gray-800">$1</em>');
  
  // Links
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="text-blue-600 hover:text-blue-800 underline transition-colors" target="_blank" rel="noopener noreferrer">$1</a>');
  
  // Inline code
  html = html.replace(/`(.*?)`/g, '<code class="bg-gray-100 px-2 py-1 rounded text-sm font-mono border border-gray-300 text-gray-800">$1</code>');
  
  // Blockquotes
  html = html.replace(/^> (.*$)/gim, '<blockquote class="border-l-4 border-blue-500 pl-4 py-2 my-4 text-gray-600 italic bg-blue-50 rounded-r-lg">$1</blockquote>');
  
  // Code blocks
  html = html.replace(/```([\s\S]*?)```/g, '<pre class="bg-gray-900 text-white p-4 rounded my-4 overflow-x-auto"><code>$1</code></pre>');
  
  // Lists - improved handling
  const lines = html.split('\n');
  const processedLines = [];
  let inList = false;
  let inOrderedList = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    
    if (line === '') {
      if (inList) {
        processedLines.push('</ul>');
        inList = false;
      }
      if (inOrderedList) {
        processedLines.push('</ol>');
        inOrderedList = false;
      }
      continue;
    }

    // Unordered lists
    if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) {
        processedLines.push('<ul class="list-disc ml-6 my-4 space-y-2">');
        inList = true;
      }
      let content = line.substring(2);
      // Process color tags in list items
      content = content.replace(/\{color:(#[0-9A-Fa-f]{6}|[a-zA-Z]+)\}(.*?)\{\/color\}/g, '<span style="color: $1;">$2</span>');
      processedLines.push(`<li class="text-gray-700">${content}</li>`);
      continue;
    }

    // Ordered lists
    if (line.match(/^\d+\. /)) {
      if (!inOrderedList) {
        processedLines.push('<ol class="list-decimal ml-6 my-4 space-y-2">');
        inOrderedList = true;
      }
      let content = line.replace(/^\d+\. /, '');
      // Process color tags in list items
      content = content.replace(/\{color:(#[0-9A-Fa-f]{6}|[a-zA-Z]+)\}(.*?)\{\/color\}/g, '<span style="color: $1;">$2</span>');
      processedLines.push(`<li class="text-gray-700">${content}</li>`);
      continue;
    }

    // Close lists if this line is not a list item
    if (inList && !line.startsWith('- ') && !line.startsWith('* ')) {
      processedLines.push('</ul>');
      inList = false;
    }
    if (inOrderedList && !line.match(/^\d+\. /)) {
      processedLines.push('</ol>');
      inOrderedList = false;
    }

    // If line looks like the start of an HTML tag that may have been split across lines
    if (line.startsWith('<img') || line === '<img') {
      // Merge subsequent lines until we find the closing '>' or '/>' to reconstruct the full tag
      let merged = line;
      let j = i + 1;
      while (j < lines.length && !lines[j].includes('>') && !lines[j].includes('/>')) {
        merged += ' ' + lines[j].trim();
        j++;
      }
      if (j < lines.length) {
        merged += ' ' + lines[j].trim();
        i = j; // advance outer loop to skip merged lines
      }
      processedLines.push(merged);
      continue;
    }

    // If line already contains HTML (like images or other tags), keep it as is
    if (line.includes('<div') || line.includes('<h') || line.includes('<blockquote') || line.includes('<ul') || line.includes('<ol') || line.includes('<li') || line.includes('<pre') || line.includes('<code') || line.includes('<a') || line.includes('<strong') || line.includes('<em') || line.includes('<img')) {
      processedLines.push(line);
    } 
    // Otherwise, wrap in paragraph if it's not empty
    else if (line && !line.startsWith('```')) {
      // Color tags already processed at top level, but also process inline colors for paragraphs
      processedLines.push(`<p class="my-4 leading-relaxed text-gray-700">${line}</p>`);
    }
  }

  // Close any open lists
  if (inList) processedLines.push('</ul>');
  if (inOrderedList) processedLines.push('</ol>');

  return processedLines.join('\n');
};

// Static method to get popular blogs
blogSchema.statics.getPopularBlogs = function(limit = 5) {
  return this.find({ status: 'published', isActive: true })
    .sort({ views: -1, likesCount: -1 })
    .limit(limit)
    .populate('author', 'name')
    .populate('category', 'name');
};

// Instance method to increment views
blogSchema.methods.incrementViews = function() {
  this.views += 1;
  return this.save();
};

// Instance method to toggle like
blogSchema.methods.toggleLike = function(userId) {
  const likeIndex = this.likes.indexOf(userId);
  
  if (likeIndex > -1) {
    this.likes.splice(likeIndex, 1);
    this.likesCount = this.likes.length;
    return { liked: false, likesCount: this.likesCount };
  } else {
    this.likes.push(userId);
    this.likesCount = this.likes.length;
    return { liked: true, likesCount: this.likesCount };
  }
};

module.exports = mongoose.model('Blog', blogSchema);