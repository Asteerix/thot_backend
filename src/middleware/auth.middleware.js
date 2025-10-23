/* eslint-disable */
const jwt = require('jsonwebtoken');
const AuthService = require('../services/auth.service');

exports.auth = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'No authentication token provided'
    });
  }

  try {
    // Security: Never log sensitive data
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Try to find user in both collections
    // Support both 'id' and 'userId' in token
    const userId = decoded.id || decoded.userId;
    const userResult = await AuthService.findUserById(userId);

    if (!userResult) {
      throw new Error('User not found');
    }

    const { user } = userResult;
    const isJournalist = user.role === 'journalist';

    // Check if user is banned
    if (user.status === 'banned') {
      return res.status(403).json({
        success: false,
        message: 'Account is permanently banned',
        bannedAt: user.bannedAt,
        reason: user.banReason
      });
    }
    
    // Check if user is suspended
    if (user.status === 'suspended') {
      // Check if suspension has expired
      if (user.suspendedUntil && new Date() > new Date(user.suspendedUntil)) {
        // Suspension expired, reactivate user
        user.status = 'active';
        user.suspendedUntil = undefined;
        user.suspensionReason = undefined;
        await user.save();
      } else {
        // Allow access to certain endpoints for suspended users
        const allowedPaths = [
          '/api/notifications/unread-count',
          '/api/notifications',
          '/api/auth/profile',
          '/api/auth/logout'
        ];
        
        const isAllowedPath = allowedPaths.some(path => req.originalUrl.startsWith(path));
        
        if (!isAllowedPath) {
          return res.status(403).json({
            success: false,
            message: 'Account is suspended',
            reason: user.suspensionReason || 'No reason provided'
          });
        }
      }
    }

    // Add user and roles to request object
    req.user = user;
    req.userId = user._id.toString();
    req.isJournalist = isJournalist;
    req.isAdmin = !isJournalist && user.role === 'admin';
    
    // Also add isAdmin to user object for backward compatibility
    req.user.isAdmin = req.isAdmin;
    
    // Debug log
    console.log('[AUTH MIDDLEWARE] User authenticated:', {
      userId: user._id,
      email: user.email,
      role: user.role,
      isJournalist: isJournalist,
      isAdmin: req.isAdmin,
      userCollection: user.constructor.modelName
    });
    
    // Update last active
    await user.updateLastActive();

    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Authentication failed',
      error: error.message
    });
  }
};

exports.requireAdmin = (req, res, next) => {
  if (!req.isAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin privileges required.'
    });
  }
  next();
};

exports.requireJournalist = (req, res, next) => {
  if (!req.isJournalist) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Journalist privileges required.'
    });
  }
  next();
};

exports.requireVerifiedJournalist = (req, res, next) => {
  if (!req.isJournalist || !req.user.isVerified) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Verified journalist privileges required.'
    });
  }
  next();
};

exports.requireActiveStatus = (req, res, next) => {
  // Check for banned accounts
  if (req.user.status === 'banned') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Account is permanently banned.'
    });
  }
  
  // Check for suspended accounts
  if (req.user.status === 'suspended') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Account is suspended.'
    });
  }
  next();
};

// Generate JWT token
exports.generateToken = (id, userType = 'user') => {
  return AuthService.generateToken(id, userType);
};

// Verify JWT token
exports.verifyToken = (token) => {
  return AuthService.verifyToken(token);
};

// Middleware to handle rate limiting
exports.rateLimit = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
};

// Middleware to update last active timestamp
// Optional authentication middleware - doesn't fail if no token provided
exports.optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      // No token provided, continue without authentication
      console.log('[OPTIONAL AUTH] No token provided, continuing without auth');
      return next();
    }

    console.log('[OPTIONAL AUTH] Token found, attempting authentication');
    console.log('[OPTIONAL AUTH] Token preview:', token.substring(0, 20) + '...' + token.substring(token.length - 10));

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('[OPTIONAL AUTH] Token decoded successfully:', {
        id: decoded.id,
        userId: decoded.userId,
        hasId: !!decoded.id,
        hasUserId: !!decoded.userId,
        iat: decoded.iat,
        exp: decoded.exp
      });
    } catch (error) {
      console.log('[OPTIONAL AUTH] Invalid token, continuing without auth:', error.message);
      // Invalid token, continue without authentication
      return next();
    }

    // Support both 'id' and 'userId' in token (like in regular auth middleware)
    const userId = decoded.id || decoded.userId;
    console.log('[OPTIONAL AUTH] Looking up user with ID:', userId);

    // Try to find user in both collections
    const userResult = await AuthService.findUserById(userId);

    if (!userResult) {
      console.log('[OPTIONAL AUTH] User not found, continuing without auth');
      return next();
    }

    const { user } = userResult;
    const isJournalist = user.role === 'journalist';

    // Check if user is suspended
    if (user.status === 'suspended') {
      if (user.suspendedUntil && new Date() > new Date(user.suspendedUntil)) {
        // Suspension expired, reactivate user
        user.status = 'active';
        user.suspendedUntil = undefined;
        user.suspensionReason = undefined;
        await user.save();
      } else {
        console.log('[OPTIONAL AUTH] User is suspended, continuing without auth');
        return next();
      }
    }

    // Add user and roles to request object
    req.user = user;
    req.userId = user._id.toString();
    req.isJournalist = isJournalist;
    req.isAdmin = !isJournalist && user.role === 'admin';
    req.user.isAdmin = req.isAdmin;
    
    console.log('[OPTIONAL AUTH] User authenticated:', {
      userId: user._id,
      email: user.email,
      role: user.role,
      isJournalist: isJournalist,
      isAdmin: req.isAdmin
    });

    next();
  } catch (error) {
    console.error('[OPTIONAL AUTH] Error:', error);
    // Continue without authentication on any error
    next();
  }
};

exports.updateLastActive = async (req, res, next) => {
  try {
    if (req.user) {
      // Convert to mongoose document if it's a plain object (from toObject())
      if (!req.user.updateLastActive) {
        const userResult = await AuthService.findUserById(req.user._id);
        if (userResult) {
          req.user = userResult.user;
        }
      }
      await req.user.updateLastActive();
    }
    next();
  } catch (error) {
    console.error('Update last active error:', error);
    // Continue even if update fails
    next();
  }
};
