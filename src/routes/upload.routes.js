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
    req.body.type = 'video';
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
    req.body.type = 'article';  // Use article type for general images
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
    req.body.type = 'profile';
    req.fileType = 'profile'; // Also set fileType for the fileFilter
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
    req.body.type = 'cover';
    req.fileType = 'cover'; // Also set fileType for the fileFilter
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
