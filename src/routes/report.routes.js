const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controller');
const { auth, requireActiveStatus, updateLastActive } = require('../middleware/auth.middleware');
const { validationRules } = require('../middleware/validation.middleware');
const { limiters } = require('../middleware/rateLimiter.middleware');

// All routes require authentication
router.use(auth);
router.use(requireActiveStatus);
router.use(updateLastActive);

router.post('/', limiters.report, validationRules.createReport, reportController.createReport);

router.get('/', reportController.getReports);

router.get('/my', reportController.getMyReports);

router.get('/stats/:targetType/:targetId', reportController.getReportStats);

router.put('/:reportId/review', reportController.reviewReport);

// New endpoint for app problem reports
router.post('/problem', limiters.report, validationRules.createProblemReport, reportController.createProblemReport);

// Get problem reports (admin only)
router.get('/problems', reportController.getProblemReports);

// Get problem report statistics (admin only)
router.get('/problems/stats', reportController.getProblemReportStats);

// Update problem report (admin only)
router.put('/problems/:id', reportController.updateProblemReport);

module.exports = router;
