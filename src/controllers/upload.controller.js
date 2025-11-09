const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const sizeOf = require('image-size');
const User = require('../models/user.model');
const s3Service = require('../services/s3.service');
const videoProcessor = require('../services/videoProcessor.service');

const validateImageAspectRatio = (filePath, type, mimetype) => {
  try {
    if (!mimetype || !mimetype.startsWith('image/')) {
      return true;
    }

    const dimensions = sizeOf(filePath);
    const aspectRatio = dimensions.width / dimensions.height;

    const isWithinRange = (ratio, target) => Math.abs(ratio - target) < 0.1;

    switch (type) {
    case 'question':
      return isWithinRange(aspectRatio, 16/9);
    case 'short':
      return isWithinRange(aspectRatio, 9/16);
    case 'article':
    case 'video':
    case 'podcast':
      return isWithinRange(aspectRatio, 1);
    default:
      return true;
    }
  } catch (error) {
    console.log('[UPLOAD] Could not validate aspect ratio for file:', filePath, error.message);
    return true;
  }
};

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  let type = req.query.type || req.fileType;

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

  const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.MOV'];
  const audioExtensions = ['.mp3', '.wav', '.m4a', '.aac'];

  if (videoExtensions.some(ext => file.originalname.toLowerCase().endsWith(ext.toLowerCase()))) {
    mimeType = 'video/mp4';
  } else if (audioExtensions.some(ext => file.originalname.toLowerCase().endsWith(ext.toLowerCase()))) {
    mimeType = 'audio/mpeg';
  }

  const validationError = (message, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
  };

  switch (type) {
  case 'video':
  case 'short':
    if (mimeType.startsWith('video/') || mimeType.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(validationError('Invalid file type. Expected video or image file.'), false);
    }
    break;
  case 'podcast':
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
  case 'image':
    if (mimeType === 'image/jpeg' || mimeType === 'image/png' || mimeType === 'image/jpg' || mimeType === 'image/webp') {
      cb(null, true);
    } else {
      cb(validationError(`Invalid file type. Expected image file (jpeg, png, webp). Got: ${mimeType}`), false);
    }
    break;
  default:
    if (mimeType.startsWith('image/') || mimeType.startsWith('video/') || mimeType.startsWith('audio/')) {
      console.log('[UPLOAD] Warning: No upload type specified, accepting file based on mime type');
      cb(null, true);
    } else {
      cb(validationError(`Unsupported file type: ${mimeType}`), false);
    }
  }
};

const getFileSizeLimit = (type) => {
  switch (type) {
  case 'video':
  case 'short':
    return 500 * 1024 * 1024;
  case 'podcast':
    return 100 * 1024 * 1024;
  case 'profile':
  case 'cover':
  case 'image':
  case 'article':
  case 'question':
  case 'thumbnail':
    return 10 * 1024 * 1024;
  default:
    return 10 * 1024 * 1024;
  }
};

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
  console.log('[UPLOAD] Request fileType:', req.fileType);

  const type = req.query.type || req.fileType || 'misc';
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

    const uploadType = req.query.type || req.body.type;
    const altText = req.body.alt || req.query.alt;

    const key = s3Service.generateKey(uploadType, req.file.originalname);

    const uploadResult = await s3Service.uploadFile(
      req.file.buffer,
      key,
      req.file.mimetype,
      {
        originalName: req.file.originalname,
        uploadType: uploadType,
        userId: req.user._id.toString(),
      }
    );

    let metadata = {
      url: uploadResult.url,
      key: uploadResult.key,
      size: req.file.size,
      format: path.extname(req.file.originalname).substring(1),
      filename: req.file.originalname,
      originalName: req.file.originalname,
      alt: altText || ''
    };

    const isActualImage = req.file.mimetype && req.file.mimetype.startsWith('image/');

    if (isActualImage && req.file.buffer) {
      try {
        const dimensions = sizeOf(req.file.buffer);
        metadata.width = dimensions.width;
        metadata.height = dimensions.height;

        metadata = {
          ...metadata,
          original: uploadResult.url,
          thumbnail: uploadResult.url,
          medium: uploadResult.url,
          large: uploadResult.url,
          metadata: {
            width: dimensions.width,
            height: dimensions.height,
            size: req.file.size
          }
        };
      } catch (error) {
        console.error('[UPLOAD] Error getting image dimensions:', error);
      }
    }

    if (uploadType === 'profile' || uploadType === 'cover') {
      const field = uploadType === 'profile' ? 'avatarUrl' : 'coverUrl';
      const user = await User.findById(req.user._id);
      if (user) {
        const oldUrl = user[field];
        if (oldUrl) {
          const oldKey = s3Service.extractKeyFromUrl(oldUrl);
          if (oldKey) {
            try {
              await s3Service.deleteFile(oldKey);
              console.log('[UPLOAD] Deleted old file from S3:', oldKey);
            } catch (error) {
              console.error('[UPLOAD] Error deleting old file from S3:', error);
            }
          }
        }
      }
      await User.findByIdAndUpdate(req.user._id, { [field]: uploadResult.url });

      metadata = {
        url: uploadResult.url,
        publicId: uploadResult.key,
        width: metadata.width || 0,
        height: metadata.height || 0,
        format: metadata.format,
        size: req.file.size
      };
    }

    console.log('[UPLOAD] File uploaded successfully to S3:', {
      type: uploadType,
      filename: req.file.originalname,
      url: uploadResult.url
    });

    res.json({
      success: true,
      data: {
        ...metadata,
        url: uploadResult.url
      },
      url: uploadResult.url
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

  for (const file of req.files) {
    try {
      const key = s3Service.generateKey(uploadType, file.originalname);

      const uploadResult = await s3Service.uploadFile(
        file.buffer,
        key,
        file.mimetype,
        {
          originalName: file.originalname,
          uploadType: uploadType,
          userId: req.user._id.toString(),
        }
      );

      let metadata = {
        filename: file.originalname,
        url: uploadResult.url,
        status: 'success',
        size: file.size,
        format: path.extname(file.originalname).substring(1)
      };

      if (file.mimetype.startsWith('image/')) {
        try {
          const dimensions = sizeOf(file.buffer);
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
    }
  }

  const response = {
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

const batchUpload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024
  }
}).array('files[]', 20);

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
