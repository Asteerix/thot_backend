/* eslint-disable */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

// Default optimization settings
const defaultOptions = {
  // Image quality settings
  jpeg: { quality: 85, progressive: true },
  png: { compressionLevel: 9, adaptiveFiltering: true },
  webp: { quality: 80 },
  avif: { quality: 70 },
  
  // Resize settings
  resize: {
    profile: { width: 300, height: 300, fit: 'cover' },
    cover: { width: 1200, height: 400, fit: 'cover' },
    post: { width: 800, height: null, fit: 'inside' },
    thumbnail: { width: 400, height: 300, fit: 'cover' },
    short: { width: 720, height: 1280, fit: 'cover' }
  },
  
  // Generate multiple formats
  formats: ['webp', 'original'],
  
  // File size limits (in bytes)
  maxFileSize: 10 * 1024 * 1024, // 10MB
  
  // Whether to keep original file
  keepOriginal: true
};

/**
 * Optimize image based on type
 * @param {Buffer} buffer - Image buffer
 * @param {string} type - Image type (profile, cover, post, etc.)
 * @param {Object} options - Optimization options
 * @returns {Promise<Object>} Optimized image data
 */
const optimizeImage = async (buffer, type, options = {}) => {
  const config = { ...defaultOptions, ...options };
  const resizeConfig = config.resize[type] || config.resize.post;
  
  try {
    // Get image metadata
    const metadata = await sharp(buffer).metadata();
    
    // Start with the base image
    let pipeline = sharp(buffer, { failOnError: false });
    
    // Auto-rotate based on EXIF orientation
    pipeline = pipeline.rotate();
    
    // Resize if needed
    if (resizeConfig) {
      // Only resize if image is larger than target dimensions
      const shouldResize = 
        (resizeConfig.width && metadata.width > resizeConfig.width) ||
        (resizeConfig.height && metadata.height > resizeConfig.height);
      
      if (shouldResize) {
        pipeline = pipeline.resize(resizeConfig);
      }
    }
    
    // Apply format-specific optimizations
    const format = metadata.format;
    const _result = {
      original: null,
      optimized: {},
      metadata: {
        originalFormat: format,
        originalSize: buffer.length,
        originalDimensions: {
          width: metadata.width,
          height: metadata.height
        }
      }
    };
    
    // Process each requested format
    for (const targetFormat of config.formats) {
      if (targetFormat === 'original') {
        // Optimize in original format
        let outputBuffer;
        
        switch (format) {
        case 'jpeg':
        case 'jpg':
          outputBuffer = await pipeline
            .jpeg(config.jpeg)
            .toBuffer();
          break;
            
        case 'png':
          outputBuffer = await pipeline
            .png(config.png)
            .toBuffer();
          break;
            
        case 'webp':
          outputBuffer = await pipeline
            .webp(config.webp)
            .toBuffer();
          break;
            
        case 'avif':
          outputBuffer = await pipeline
            .avif(config.avif)
            .toBuffer();
          break;
            
        default:
          outputBuffer = await pipeline.toBuffer();
        }
        
        result.original = {
          buffer: outputBuffer,
          format,
          size: outputBuffer.length,
          mimeType: `image/${format}`
        };
      } else {
        // Convert to different format
        let outputBuffer;
        
        switch (targetFormat) {
        case 'webp':
          outputBuffer = await sharp(buffer)
            .rotate()
            .resize(resizeConfig)
            .webp(config.webp)
            .toBuffer();
          break;
            
        case 'avif':
          outputBuffer = await sharp(buffer)
            .rotate()
            .resize(resizeConfig)
            .avif(config.avif)
            .toBuffer();
          break;
            
        default:
          continue;
        }
        
        result.optimized[targetFormat] = {
          buffer: outputBuffer,
          format: targetFormat,
          size: outputBuffer.length,
          mimeType: `image/${targetFormat}`
        };
      }
    }
    
    // Calculate optimization stats
    result.metadata.optimizationRatio = 
      result.original ? 
        ((buffer.length - result.original.size) / buffer.length * 100).toFixed(2) + '%' :
        '0%';
    
    return result;
  } catch (error) {
    console.error('Image optimization error:', error);
    throw new Error(`Failed to optimize image: ${error.message}`);
  }
};

/**
 * Generate thumbnail from image
 * @param {Buffer} buffer - Image buffer
 * @param {Object} options - Thumbnail options
 * @returns {Promise<Buffer>} Thumbnail buffer
 */
const generateThumbnail = async (buffer, options = {}) => {
  const config = {
    width: 200,
    height: 200,
    fit: 'cover',
    position: 'center',
    ...options
  };
  
  try {
    return await sharp(buffer)
      .rotate()
      .resize(config)
      .jpeg({ quality: 80, progressive: true })
      .toBuffer();
  } catch (error) {
    console.error('Thumbnail generation error:', error);
    throw new Error(`Failed to generate thumbnail: ${error.message}`);
  }
};

/**
 * Extract dominant colors from image
 * @param {Buffer} buffer - Image buffer
 * @param {number} count - Number of colors to extract
 * @returns {Promise<Array>} Array of dominant colors
 */
const extractColors = async (buffer, count = 5) => {
  try {
    const { dominant } = await sharp(buffer)
      .resize(100, 100) // Resize for faster processing
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    // Simple color extraction (would need more sophisticated algorithm for production)
    const colors = [];
    const pixelCount = dominant.length / 3;
    const step = Math.floor(pixelCount / count);
    
    for (let i = 0; i < count; i++) {
      const offset = i * step * 3;
      colors.push({
        r: dominant[offset],
        g: dominant[offset + 1],
        b: dominant[offset + 2],
        hex: `#${dominant[offset].toString(16).padStart(2, '0')}${dominant[offset + 1].toString(16).padStart(2, '0')}${dominant[offset + 2].toString(16).padStart(2, '0')}`
      });
    }
    
    return colors;
  } catch (error) {
    console.error('Color extraction error:', error);
    return [];
  }
};

/**
 * Image optimization middleware for Express
 * @param {Object} options - Middleware options
 * @returns {Function} Express middleware
 */
const imageOptimizationMiddleware = (options = {}) => {
  const config = { ...defaultOptions, ...options };
  
  return async (req, res, next) => {
    // Check if request has files
    if (!req.file && !req.files) {
      return next();
    }
    
    // Get files array
    const files = req.files ? 
      (Array.isArray(req.files) ? req.files : Object.values(req.files).flat()) : 
      [req.file];
    
    // Process each file
    for (const file of files) {
      // Check if it's an image
      if (!file.mimetype || !file.mimetype.startsWith('image/')) {
        continue;
      }
      
      try {
        // Determine image type from field name or path
        let imageType = 'post';
        if (file.fieldname) {
          if (file.fieldname.includes('profile')) imageType = 'profile';
          else if (file.fieldname.includes('cover')) imageType = 'cover';
          else if (file.fieldname.includes('thumbnail')) imageType = 'thumbnail';
          else if (file.fieldname.includes('short')) imageType = 'short';
        }
        
        // Read file buffer
        const buffer = file.buffer || await fs.readFile(file.path);
        
        // Optimize image
        const _result = await optimizeImage(buffer, imageType, config);
        
        // Update file object
        if (result.original) {
          file.buffer = result.original.buffer;
          file.size = result.original.size;
          file.optimized = true;
          file.optimizationRatio = result.metadata.optimizationRatio;
        }
        
        // Add optimized versions
        file.versions = result.optimized;
        file.metadata = result.metadata;
        
        // Save optimized file if using disk storage
        if (file.path && result.original) {
          await fs.writeFile(file.path, result.original.buffer);
          
          // Save additional formats
          for (const [format, data] of Object.entries(result.optimized)) {
            const formatPath = file.path.replace(
              path.extname(file.path),
              `.${format}`
            );
            await fs.writeFile(formatPath, data.buffer);
            data.path = formatPath;
          }
        }
        
        // Add thumbnail if requested
        if (config.generateThumbnail) {
          const thumbnail = await generateThumbnail(buffer);
          file.thumbnail = {
            buffer: thumbnail,
            size: thumbnail.length,
            mimeType: 'image/jpeg'
          };
          
          if (file.path) {
            const thumbPath = file.path.replace(
              path.extname(file.path),
              '_thumb.jpg'
            );
            await fs.writeFile(thumbPath, thumbnail);
            file.thumbnail.path = thumbPath;
          }
        }
        
        // Extract colors if requested
        if (config.extractColors) {
          file.colors = await extractColors(buffer);
        }
        
      } catch (error) {
        console.error('Image optimization middleware error:', error);
        // Continue without optimization on error
      }
    }
    
    next();
  };
};

/**
 * Validate image dimensions
 * @param {Buffer} buffer - Image buffer
 * @param {Object} requirements - Dimension requirements
 * @returns {Promise<Object>} Validation result
 */
const validateImageDimensions = async (buffer, requirements) => {
  try {
    const metadata = await sharp(buffer).metadata();
    
    const _result = {
      valid: true,
      width: metadata.width,
      height: metadata.height,
      errors: []
    };
    
    if (requirements.minWidth && metadata.width < requirements.minWidth) {
      result.valid = false;
      result.errors.push(`Width must be at least ${requirements.minWidth}px`);
    }
    
    if (requirements.maxWidth && metadata.width > requirements.maxWidth) {
      result.valid = false;
      result.errors.push(`Width must not exceed ${requirements.maxWidth}px`);
    }
    
    if (requirements.minHeight && metadata.height < requirements.minHeight) {
      result.valid = false;
      result.errors.push(`Height must be at least ${requirements.minHeight}px`);
    }
    
    if (requirements.maxHeight && metadata.height > requirements.maxHeight) {
      result.valid = false;
      result.errors.push(`Height must not exceed ${requirements.maxHeight}px`);
    }
    
    if (requirements.aspectRatio) {
      const aspectRatio = metadata.width / metadata.height;
      const targetRatio = requirements.aspectRatio;
      const tolerance = requirements.aspectRatioTolerance || 0.1;
      
      if (Math.abs(aspectRatio - targetRatio) > tolerance) {
        result.valid = false;
        result.errors.push(`Aspect ratio must be close to ${targetRatio}:1`);
      }
    }
    
    return result;
  } catch (error) {
    return {
      valid: false,
      errors: [`Invalid image: ${error.message}`]
    };
  }
};

module.exports = {
  optimizeImage,
  generateThumbnail,
  extractColors,
  imageOptimizationMiddleware,
  validateImageDimensions,
  defaultOptions
};
