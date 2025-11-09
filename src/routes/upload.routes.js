const express = require('express');
const router = express.Router();
const {
  uploadFile,
  uploadMiddleware,
  uploadProfilePhoto,
  uploadCoverPhoto,
  batchUploadMiddleware,
  uploadBatch
} = require('../controllers/upload.controller');
const {
  auth,
  requireJournalist
} = require('../middleware/auth.middleware');
const { imageOptimizationMiddleware } = require('../middleware/imageOptimization.middleware');

// General file upload route for journalists
router.post('/',
  auth,
  uploadMiddleware,
  uploadFile
);

// Video upload route
router.post('/video',
  auth,
  requireJournalist,
  (req, res, next) => {
    req.fileType = 'video';
    next();
  },
  uploadMiddleware,
  uploadFile
);

// Podcast upload route
router.post('/podcast',
  auth,
  requireJournalist,
  (req, res, next) => {
    req.fileType = 'podcast';
    next();
  },
  uploadMiddleware,
  uploadFile
);

// Audio upload route (alias for podcast)
router.post('/audio',
  auth,
  requireJournalist,
  (req, res, next) => {
    req.fileType = 'podcast';
    next();
  },
  uploadMiddleware,
  uploadFile
);

// Image upload route
router.post('/image',
  auth,
  requireJournalist,
  (req, res, next) => {
    req.fileType = 'article';  // Use article type for general images
    next();
  },
  uploadMiddleware,
  imageOptimizationMiddleware({ extractColors: true }),
  uploadFile
);

// Profile photo upload route
router.post('/profile',
  auth,
  (req, res, next) => {
    req.fileType = 'profile'; // Set fileType for the fileFilter
    next();
  },
  uploadMiddleware,
  imageOptimizationMiddleware({ generateThumbnail: true }),
  uploadProfilePhoto
);

// Cover photo upload route
router.post('/cover',
  auth,
  (req, res, next) => {
    req.fileType = 'cover'; // Set fileType for the fileFilter
    next();
  },
  uploadMiddleware,
  imageOptimizationMiddleware(),
  uploadCoverPhoto
);

// Batch upload route
router.post('/batch',
  auth,
  batchUploadMiddleware,
  uploadBatch
);

module.exports = router;
