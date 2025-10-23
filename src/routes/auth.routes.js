const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { auth, requireActiveStatus, updateLastActive } = require('../middleware/auth.middleware');
const { validationRules } = require('../middleware/validation.middleware');
const { limiters } = require('../middleware/rateLimiter.middleware');

// Public routes
router.post('/register', limiters.register, validationRules.register, authController.register);
router.post('/login', limiters.auth, validationRules.login, authController.login);
router.post('/refresh-token', limiters.api, authController.refreshToken);
router.post('/google', limiters.auth, authController.googleSignIn);

// Protected routes
router.use(auth);
router.use(requireActiveStatus);
router.use(updateLastActive);

router.post('/logout', authController.logout);
router.get('/profile', authController.getProfile);
router.patch('/profile', limiters.write, authController.updateProfile);
router.put('/profile', limiters.write, authController.updateProfile); // Support both PATCH and PUT
router.post('/change-password', limiters.passwordReset, validationRules.changePassword, authController.changePassword);
router.delete('/delete-account', authController.deleteAccount);

module.exports = router;
