const router = require('express').Router();
const adminController = require('../controllers/admin.controller');
const { auth, requireAdmin } = require('../middleware/auth.middleware');

// All routes require authentication and admin role
router.use(auth);
router.use(requireAdmin);

// Platform statistics
router.get('/stats', adminController.getStats);
router.get('/journalists/stats', adminController.getJournalistStats);
router.get('/journalists/stats/detailed', adminController.getDetailedJournalistStats);

// Journalist management
router.get('/journalists', adminController.getJournalists); // New endpoint with query params for filtering
router.get('/journalists/verified', adminController.getVerifiedJournalists);
router.get('/journalists/pending', adminController.getPendingJournalists);
router.get('/journalists/rejected', adminController.getRejectedJournalists);
router.get('/journalists/press-cards', adminController.getJournalistsWithPressCards); // List journalists with press card info
router.put('/journalists/:id/approve', adminController.approveJournalist);
router.put('/journalists/:id/reject', adminController.rejectJournalist);
router.put('/journalists/:id/unverify', adminController.unverifyJournalist);
router.put('/journalists/:id/toggle-verification', adminController.toggleJournalistVerification); // Toggle verification based on press card

// Post management
router.get('/posts', adminController.getPosts);
router.delete('/posts/:id', adminController.deletePost);

// Reports management
router.get('/reports', adminController.getReports);
router.get('/reports/by-target/:targetType/:targetId', adminController.getReportsByTarget);
router.put('/reports/:id/review', adminController.reviewReport);

// Content deletion
router.delete('/content/:type/:id', adminController.deleteContent);

// User management
router.get('/users', adminController.getUsers);
router.put('/users/:id/suspend', adminController.suspendUser);
router.put('/users/:id/ban', adminController.banUser);
router.put('/users/:id/unban', adminController.unbanUser);
router.put('/users/:id/role', adminController.updateUserRole);

// Content moderation (specific endpoints for mobile app)
// Note: POST delete is already defined above, remove duplicate
// router.delete('/posts/:id', adminController.deletePost);
router.delete('/comments/:id', adminController.deleteComment);
router.delete('/shorts/:id', adminController.deleteShort);

// Audit logs
router.get('/logs', adminController.getAuditLogs);

// Press cards management
// NOTE: Duplicate routes removed - these are already defined above

module.exports = router;
