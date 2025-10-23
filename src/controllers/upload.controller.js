/* eslint-disable */
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const sizeOf = require('image-size');
const User = require('../models/user.model');
const { buildUrl } = require('../utils/urlHelper');
const videoProcessor = require('../services/videoProcessor.service');

// Aspect ratio validation - only for image files
const validateImageAspectRatio = (filePath, type, mimetype) => {
  try {
    // Skip validation for non-image files
    if (!mimetype || !mimetype.startsWith('image/')) {
      return true;
    }

    const dimensions = sizeOf(filePath);
    const aspectRatio = dimensions.width / dimensions.height;
    
    // Allow small deviation (0.1) from exact ratios
    const isWithinRange = (ratio, target) => Math.abs(ratio - target) < 0.1;

    switch (type) {
    case 'question':
      // Landscape 16:9
      return isWithinRange(aspectRatio, 16/9);
    case 'short':
      // Portrait 9:16
      return isWithinRange(aspectRatio, 9/16);
    case 'article':
    case 'video':
    case 'podcast':
      // Square 1:1
      return isWithinRange(aspectRatio, 1);
    default:
      return true; // No validation for other types
    }
  } catch (error) {
    console.log('[UPLOAD] Could not validate aspect ratio for file:', filePath, error.message);
    return true; // Allow file if we can't validate (e.g., for video files)
  }
};

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Get type from URL path, query params, or pre-set by middleware
    let type = req.query.type || req.body.type || req.fileType || 'misc';
    
    // Deduce type from URL if not provided
    if (!type || type === 'misc') {
      if (req.originalUrl.includes('/upload/profile')) {
        type = 'profile';
      } else if (req.originalUrl.includes('/upload/cover')) {
        type = 'cover';
      }
    }
    
    // For podcasts, store audio files in podcast directory
    if (type === 'podcast' && file.mimetype.startsWith('audio/')) {
      type = 'podcast';
    }
    
    // Ensure absolute path from project root
    const dir = path.resolve(process.cwd(), `uploads/${type}`);
    console.log('[UPLOAD] Creating directory:', dir);

    // Create directory if it doesn't exist
    try {
      if (!fsSync.existsSync(dir)) {
        fsSync.mkdirSync(dir, { recursive: true });
        console.log('[UPLOAD] Created directory:', dir);
      }
    } catch (error) {
      console.error('[UPLOAD] Error creating directory:', error);
      cb(error);
      return;
    }

    console.log('[UPLOAD] Destination directory:', dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    
    // Determine file type and extension
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.MOV'];
    const audioExtensions = ['.mp3', '.wav', '.m4a', '.aac'];
    const isVideo = file.mimetype.startsWith('video/') ||
                   videoExtensions.some(ext => file.originalname.toLowerCase().endsWith(ext.toLowerCase()));
    const isAudio = file.mimetype.startsWith('audio/') ||
                   audioExtensions.some(ext => file.originalname.toLowerCase().endsWith(ext.toLowerCase()));

    let extension;
    if (isVideo) {
      extension = '.mp4';
    } else if (isAudio) {
      extension = '.mp3';
    } else {
      extension = path.extname(file.originalname);
    }

    const filename = uniqueSuffix + extension;
    // Generated filename successfully
    cb(null, filename);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  // Get type from URL path, query params, or pre-set by middleware
  let type = req.query.type || req.fileType;
  
  // Deduce type from URL if not provided
  if (!type) {
    if (req.originalUrl.includes('/upload/profile')) {
      type = 'profile';
    } else if (req.originalUrl.includes('/upload/cover')) {
      type = 'cover';
    } else if (req.originalUrl.includes('/upload/video')) {
      type = 'video';
    } else if (req.originalUrl.includes('/upload/image')) {
      type = 'article';
    }
  }
  
  let mimeType = file.mimetype;
  
  // Handle common video and audio formats that might be misidentified
  const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.MOV'];
  const audioExtensions = ['.mp3', '.wav', '.m4a', '.aac'];
  
  if (videoExtensions.some(ext => file.originalname.toLowerCase().endsWith(ext.toLowerCase()))) {
    mimeType = 'video/mp4'; // Treat all video files as MP4
  } else if (audioExtensions.some(ext => file.originalname.toLowerCase().endsWith(ext.toLowerCase()))) {
    mimeType = 'audio/mpeg'; // Treat all audio files as MP3
  }

  // File filter validation

  // Create a validation error with status code
  const validationError = (message, statusCode = 400) => {
    const _error = new Error(message);
    error.statusCode = statusCode;
    return error;
  };

  switch (type) {
  case 'video':
  case 'short':
    // Allow any video format (will be converted to mp4) and images for thumbnails
    if (mimeType.startsWith('video/') || mimeType.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(validationError('Invalid file type. Expected video or image file.'), false);
    }
    break;
  case 'podcast':
    // Allow audio files and images (for podcast cover)
    if (mimeType.startsWith('audio/') || mimeType.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(validationError('Invalid file type. Expected audio file or image.'), false);
    }
    break;
  case 'article':
  case 'documentation':
  case 'opinion':
  case 'testimony':
  case 'profile':
  case 'cover':
  case 'question':
  case 'thumbnail':
  case 'image':  // Allow images for various uses
    if (mimeType === 'image/jpeg' || mimeType === 'image/png' || mimeType === 'image/jpg' || mimeType === 'image/webp') {
      cb(null, true);
    } else {
      cb(validationError(`Invalid file type. Expected image file (jpeg, png, webp). Got: ${mimeType}`), false);
    }
    break;
  default:
    // If no type can be determined, just validate mime type
    if (mimeType.startsWith('image/') || mimeType.startsWith('video/') || mimeType.startsWith('audio/')) {
      console.log('[UPLOAD] Warning: No upload type specified, accepting file based on mime type');
      cb(null, true);
    } else {
      cb(validationError(`Unsupported file type: ${mimeType}`), false);
    }
  }
};

// File size limits per type
const getFileSizeLimit = (type) => {
  switch (type) {
  case 'video':
  case 'short':
    return 500 * 1024 * 1024; // 500MB for videos
  case 'podcast':
    return 100 * 1024 * 1024; // 100MB for audio
  case 'profile':
  case 'cover':
  case 'image':
  case 'article':
  case 'question':
  case 'thumbnail':
    return 10 * 1024 * 1024; // 10MB for images
  default:
    return 10 * 1024 * 1024; // 10MB default
  }
};

// Initialize multer with configuration
const createUpload = (type) => {
  return multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
      fileSize: getFileSizeLimit(type)
    }
  }).single('file');
};

exports.uploadMiddleware = (req, res, next) => {
  console.log('[UPLOAD] Starting upload middleware');
  console.log('[UPLOAD] Request body:', req.body);
  console.log('[UPLOAD] Request files:', req.files);

  const type = req.query.type || req.body.type || 'misc';
  const upload = createUpload(type);

  upload(req, res, function(err) {
    if (err instanceof multer.MulterError) {
      console.error('[UPLOAD] Multer error:', err);
      let message = err.message;
      if (err.code === 'LIMIT_FILE_SIZE') {
        const limit = getFileSizeLimit(type);
        const limitMB = Math.round(limit / 1024 / 1024);
        message = `File too large. Maximum size allowed is ${limitMB}MB`;
      }
      return res.status(413).json({
        success: false,
        error: message,
        maxSize: `${Math.round(getFileSizeLimit(type) / 1024 / 1024)}MB`
      });
    } else if (err) {
      console.error('[UPLOAD] Upload error:', err);
      
      // Use the status code from the error if available
      const statusCode = err.statusCode || (err.message.includes('Invalid') ? 400 : 500);
      
      if (err.message.includes('Invalid file type') || err.message.includes('Unsupported file type')) {
        const allowedTypes = type === 'video' || type === 'short' ? ['mp4', 'mov', 'avi'] :
          type === 'podcast' ? ['mp3', 'm4a', 'wav'] :
            ['jpeg', 'png', 'jpg', 'webp'];
        return res.status(statusCode).json({
          success: false,
          error: err.message,
          allowedTypes: allowedTypes
        });
      }
      
      return res.status(statusCode).json({
        success: false,
        error: err.message
      });
    }
    console.log('[UPLOAD] Middleware completed successfully');
    next();
  });
};

exports.uploadFile = async (req, res) => {
  console.log('[UPLOAD] File upload attempt:', {
    type: req.body.type,
    timestamp: new Date().toISOString()
  });

  if (!req.headers.authorization) {
    console.error('[UPLOAD] Authentication failed: No authorization header');
    return res.status(401).json({
      success: false,
      message: 'Authorization header missing'
    });
  }

  if (!req.user) {
    console.error('[UPLOAD] Authentication failed: Invalid or expired token');
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }

  try {
    if (!req.file) {
      console.log('[UPLOAD] Upload failed: No file provided');
      return res.status(400).json({
        success: false,
        message: 'No file provided'
      });
    }

    // Get upload type and metadata from query or body
    const uploadType = req.query.type || req.body.type;
    const altText = req.body.alt || req.query.alt;

    // Validate image aspect ratio only for image files (not videos)
    // Skip validation for video files, audio files, and thumbnails
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    const isVideoFile = (req.file.mimetype && req.file.mimetype.startsWith('video/')) || 
                       fileExtension.match(/\.(mp4|mov|avi|webm|mkv|m4v|flv|wmv|mpg|mpeg)$/);
    const isAudioFile = (req.file.mimetype && req.file.mimetype.startsWith('audio/')) ||
                       fileExtension.match(/\.(mp3|wav|ogg|m4a|aac|flac)$/);
    const isThumbnail = req.file.originalname.includes('thumbnail');
    
    // Debug logging
    console.log(`Upload file check - Name: ${req.file.originalname}, MIME: ${req.file.mimetype}, Extension: ${fileExtension}, isVideo: ${isVideoFile}`);
    
    if (req.file.mimetype && req.file.mimetype.startsWith('image/') && !isVideoFile && !isAudioFile && !isThumbnail) {
      const isValidRatio = validateImageAspectRatio(req.file.path, uploadType, req.file.mimetype);
      if (!isValidRatio) {
        fsSync.unlinkSync(req.file.path);
        let message;
        switch (uploadType) {
        case 'question':
          message = 'Les questions nécessitent des images au format paysage (ratio 16:9)';
          break;
        case 'short':
          message = 'Les shorts nécessitent des images au format portrait (ratio 9:16)';
          break;
        case 'article':
        case 'video':
        case 'podcast':
          message = 'Les publications nécessitent des images au format carré (ratio 1:1)';
          break;
        default:
          message = 'Ratio d\'aspect de l\'image invalide';
        }
        return res.status(400).json({
          success: false,
          message
        });
      }
    }

    // Store only the relative path
    const relativePath = `/uploads/${uploadType}/${req.file.filename}`;

    // Get file metadata
    const fileStats = fsSync.statSync(req.file.path);
    const fileSize = fileStats.size;
    
    let metadata = {
      url: relativePath,  // Store relative path, not full URL
      size: fileSize,
      format: path.extname(req.file.filename).substring(1),
      filename: req.file.filename,
      originalName: req.file.originalname,
      alt: altText || ''
    };

    // Add image-specific metadata (only for actual images, not videos or audio)
    const isActualImage = req.file.mimetype && req.file.mimetype.startsWith('image/') && 
                         !isVideoFile && !isAudioFile &&
                         fileExtension.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg|tiff|ico)$/i);
    
    if (isActualImage) {
      try {
        const dimensions = sizeOf(req.file.path);
        metadata.width = dimensions.width;
        metadata.height = dimensions.height;
        
        // Generate URLs for different sizes (simulated - actual resizing would be done by CDN/image service)
        const baseUrl = relativePath.substring(0, relativePath.lastIndexOf('.'));
        const ext = path.extname(relativePath);
        metadata = {
          ...metadata,
          original: relativePath,
          thumbnail: `${baseUrl}_thumb${ext}`,
          medium: `${baseUrl}_medium${ext}`,
          large: `${baseUrl}_large${ext}`,
          metadata: {
            width: dimensions.width,
            height: dimensions.height,
            size: fileSize
          }
        };
      } catch (error) {
        console.error('[UPLOAD] Error getting image dimensions:', error);
      }
    }

    // Add video-specific metadata and process video
    if (req.file.mimetype && req.file.mimetype.startsWith('video/')) {
      try {
        // Check if video needs conversion (MOV to MP4)
        const needsConversion = req.file.originalname.toLowerCase().endsWith('.mov') || 
                               req.file.mimetype === 'video/quicktime';
        
        let videoFilePath = req.file.path;
        
        // Convert MOV to MP4 if needed
        if (needsConversion) {
          const convertedPath = req.file.path.replace(/\.\w+$/, '_converted.mp4');
          try {
            await videoProcessor.convertToMP4(req.file.path, convertedPath);
            // Delete original MOV file
            await fs.unlink(req.file.path);
            videoFilePath = convertedPath;
            // Update file path for further processing
            req.file.path = convertedPath;
            req.file.filename = path.basename(convertedPath);
          } catch (conversionError) {
            console.error('[UPLOAD] Error converting MOV to MP4:', conversionError);
            // Continue with original file if conversion fails
          }
        }
        
        // Process the video to get metadata and generate thumbnail
        const processingResults = await videoProcessor.processUploadedVideo(videoFilePath, {
          generateThumbnail: true,
          compress: false, // Don't compress by default, can be enabled if needed
          createPreview: false
        });

        // Use compressed version if available, otherwise use original

        metadata = {
          ...metadata,
          videoUrl: relativePath,  // Use relative path
          thumbnailUrl: processingResults.thumbnail ? 
            processingResults.thumbnail.replace(process.cwd(), '') : '',
          duration: processingResults.metadata?.duration || 0,
          resolution: processingResults.metadata?.video ? 
            `${processingResults.metadata.video.width}x${processingResults.metadata.video.height}` : '',
          processingStatus: 'completed',
          metadata: processingResults.metadata
        };
      } catch (videoError) {
        console.error('[UPLOAD] Error processing video:', videoError);
        // Fallback to basic metadata if video processing fails
        metadata = {
          ...metadata,
          videoUrl: relativePath,
          thumbnailUrl: '',
          duration: 0,
          resolution: '',
          processingStatus: 'completed'
        };
      }
    }

    // Add audio-specific metadata
    if (req.file.mimetype.startsWith('audio/')) {
      metadata = {
        ...metadata,
        audioUrl: relativePath,  // Use relative path
        duration: 0, // Would be extracted by audio processing service
        bitrate: 0, // Would be extracted
        waveform: [] // Would be generated
      };
    }

    // Handle profile/cover photo updates
    if (uploadType === 'profile' || uploadType === 'cover') {
      const field = uploadType === 'profile' ? 'avatarUrl' : 'coverUrl';
      const user = await User.findById(req.user._id);
      if (user) {
        const oldUrl = user[field];
        if (oldUrl) {
          // Extract the path from the URL (remove protocol and domain)
          const urlPath = oldUrl.replace(/^https?:\/\/[^/]+/, '');
          const oldPath = path.join(__dirname, '..', urlPath);
          try {
            if (fsSync.existsSync(oldPath)) {
              fsSync.unlinkSync(oldPath);
              console.log('[UPLOAD] Deleted old file:', oldPath);
            }
          } catch (error) {
            console.error('[UPLOAD] Error deleting old file:', error);
          }
        }
      }
      await User.findByIdAndUpdate(req.user._id, { [field]: relativePath });  // Store relative path
      
      // For profile/cover, return simplified response
      metadata = {
        url: relativePath,  // Store relative path
        publicId: req.file.filename,
        width: metadata.width || 0,
        height: metadata.height || 0,
        format: metadata.format,
        size: fileSize
      };
    }

    console.log('[UPLOAD] File uploaded successfully:', {
      type: req.body.type,
      filename: req.file.filename,
      path: relativePath
    });

    // Return relative path - client will construct full URL as needed
    res.json({
      success: true,
      data: {
        ...metadata,
        url: relativePath  // Return relative path
      },
      url: relativePath // Keep for backward compatibility
    });
  } catch (error) {
    console.error('[UPLOAD] Upload error:', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      message: 'Failed to upload file',
      error: error.message
    });
  }
};

exports.uploadProfilePhoto = async (req, res) => {
  req.body.type = 'profile';
  return exports.uploadFile(req, res);
};

exports.uploadCoverPhoto = async (req, res) => {
  req.body.type = 'cover';
  return exports.uploadFile(req, res);
};

// Batch upload handler
exports.uploadBatch = async (req, res) => {
  console.log('[UPLOAD] Batch upload attempt');
  
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No files provided'
    });
  }

  const uploadType = req.query.type || req.body.type || 'gallery';
  const results = {
    uploaded: [],
    failed: []
  };

  // Process each file
  for (const file of req.files) {
    try {
      // Validate aspect ratio only for actual image files (not videos)
      const isImageFile = file.mimetype && file.mimetype.startsWith('image/');
      const isVideoFile = file.mimetype && file.mimetype.startsWith('video/');
      
      if (isImageFile && !isVideoFile) {
        const isValidRatio = validateImageAspectRatio(file.path, uploadType, file.mimetype);
        if (!isValidRatio) {
          fsSync.unlinkSync(file.path);
          results.failed.push({
            filename: file.originalname,
            error: `Invalid aspect ratio for ${uploadType}`,
            status: 'failed'
          });
          continue;
        }
      }

      // Store only relative path
      const relativePath = `/uploads/${uploadType}/${file.filename}`;
      // Generate full URL for response
      const fileUrl = buildUrl(req, relativePath);
      
      // Get metadata
      const fileStats = fsSync.statSync(file.path);
      let metadata = {
        filename: file.originalname,
        url: fileUrl,
        status: 'success',
        size: fileStats.size,
        format: path.extname(file.filename).substring(1)
      };

      // Add image dimensions if applicable
      if (file.mimetype.startsWith('image/')) {
        try {
          const dimensions = sizeOf(file.path);
          metadata.width = dimensions.width;
          metadata.height = dimensions.height;
        } catch (error) {
          console.error('[UPLOAD] Error getting dimensions:', error);
        }
      }

      results.uploaded.push(metadata);
    } catch (error) {
      console.error('[UPLOAD] Batch upload error for file:', file.originalname, error);
      results.failed.push({
        filename: file.originalname,
        error: error.message,
        status: 'failed'
      });
      
      // Clean up failed file
      try {
        if (fsSync.existsSync(file.path)) {
          fsSync.unlinkSync(file.path);
        }
      } catch (cleanupError) {
        console.error('[UPLOAD] Error cleaning up failed file:', cleanupError);
      }
    }
  }

  const _response = {
    success: true,
    data: {
      uploaded: results.uploaded,
      failed: results.failed,
      summary: {
        total: req.files.length,
        successful: results.uploaded.length,
        failed: results.failed.length
      }
    }
  };

  console.log('[UPLOAD] Batch upload completed:', response.data.summary);
  res.json(response);
};

// Create batch upload middleware
const batchStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = req.query.type || req.body.type || 'gallery';
    const dir = path.resolve(process.cwd(), `uploads/${type}`);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, uniqueSuffix + extension);
  }
});

const batchUpload = multer({
  storage: batchStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB per file for batch uploads
  }
}).array('files[]', 20); // Max 20 files at once

exports.batchUploadMiddleware = (req, res, next) => {
  console.log('[UPLOAD] Starting batch upload middleware');
  
  batchUpload(req, res, function(err) {
    if (err instanceof multer.MulterError) {
      console.error('[UPLOAD] Batch multer error:', err);
      return res.status(400).json({
        success: false,
        message: err.message
      });
    } else if (err) {
      console.error('[UPLOAD] Batch unknown error:', err);
      return res.status(500).json({
        success: false,
        message: err.message
      });
    }
    console.log('[UPLOAD] Batch middleware completed successfully');
    next();
  });
};
