const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const { xss } = require('express-xss-sanitizer');

// Content Security Policy configuration
// Content Security Policy configuration - currently unused
// const _contentSecurityPolicy = {
//   directives: {
//     defaultSrc: ['\'self\''],
//     styleSrc: ['\'self\'', '\'unsafe-inline\'', 'https://fonts.googleapis.com'],
//     scriptSrc: ['\'self\'', '\'unsafe-inline\'', '\'unsafe-eval\''],
//     imgSrc: ['\'self\'', 'data:', 'https:', 'blob:'],
//     connectSrc: ['\'self\'', 'https://api.cloudinary.com'],
//     fontSrc: ['\'self\'', 'https://fonts.gstatic.com'],
//     objectSrc: ['\'none\''],
//     mediaSrc: ['\'self\'', 'blob:', 'data:'],
//     frameSrc: ['\'none\'']
//   }
// };

// Security headers middleware
const securityHeaders = () => {
  return (req, res, next) => {
    // Additional security headers
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

    // Remove sensitive headers
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');

    next();
  };
};

// Request sanitization middleware
const sanitizeRequest = () => {
  return (req, res, next) => {
    // Sanitize request body
    if (req.body) {
      req.body = sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query) {
      req.query = sanitizeObject(req.query);
    }

    // Sanitize URL parameters
    if (req.params) {
      req.params = sanitizeObject(req.params);
    }

    next();
  };
};

// Recursive object sanitization
const sanitizeObject = (obj) => {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  const sanitized = {};
  for (const key in obj) {
    // Skip dangerous keys
    if (key.startsWith('$') || key.includes('.')) {
      continue;
    }

    const value = obj[key];

    // Sanitize string values
    if (typeof value === 'string') {
      // Remove null bytes
      sanitized[key] = value.replace(/\0/g, '');

      // Limit string length
      if (sanitized[key].length > 10000) {
        sanitized[key] = sanitized[key].substring(0, 10000);
      }
    } else {
      sanitized[key] = sanitizeObject(value);
    }
  }

  return sanitized;
};

// IP-based request throttling
const ipThrottle = new Map();
const throttleRequest = (maxRequests = 100, windowMs = 60000) => {
  return (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();

    if (!ipThrottle.has(ip)) {
      ipThrottle.set(ip, { count: 1, resetTime: now + windowMs });
      return next();
    }

    const throttleData = ipThrottle.get(ip);

    // Reset if window has passed
    if (now > throttleData.resetTime) {
      throttleData.count = 1;
      throttleData.resetTime = now + windowMs;
      return next();
    }

    // Check if limit exceeded
    if (throttleData.count >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests from this IP address'
      });
    }

    throttleData.count++;
    next();
  };
};

// Clean up expired throttle entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of ipThrottle.entries()) {
    if (now > data.resetTime) {
      ipThrottle.delete(ip);
    }
  }
}, 300000); // Clean up every 5 minutes

// File upload security
const fileUploadSecurity = () => {
  return (req, res, next) => {
    if (!req.files && !req.file) {
      return next();
    }

    const files = req.files ? Object.values(req.files).flat() : [req.file];

    for (const file of files) {
      // Check file size (max 50MB)
      if (file.size > 50 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          message: 'File size exceeds maximum allowed size of 50MB'
        });
      }

      // Check file extension
      const allowedExtensions = [
        '.jpg', '.jpeg', '.png', '.gif', '.webp', // Images
        '.mp4', '.webm', '.mov', // Videos
        '.mp3', '.wav', '.m4a', // Audio
        '.pdf', '.doc', '.docx' // Documents
      ];

      const fileExtension = file.originalname.toLowerCase().match(/\.[^.]+$/)?.[0];
      if (!fileExtension || !allowedExtensions.includes(fileExtension)) {
        return res.status(400).json({
          success: false,
          message: 'File type not allowed'
        });
      }

      // Sanitize filename
      file.originalname = file.originalname
        .replace(/[^a-zA-Z0-9.-]/g, '_')
        .replace(/\.{2,}/g, '.');
    }

    next();
  };
};

// API key validation (for external integrations)
const validateApiKey = () => {
  return (req, res, next) => {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API key required'
      });
    }

    // TODO: Implement actual API key validation
    // For now, just check if it matches a pattern
    if (!/^[a-zA-Z0-9]{32,}$/.test(apiKey)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid API key'
      });
    }

    next();
  };
};

// Configure all security middleware
const configureSecurity = (app) => {
  // Helmet for various security headers
  app.use(helmet({
    contentSecurityPolicy: false, // We'll use our custom CSP
    crossOriginEmbedderPolicy: false
  }));

  // Custom security headers
  app.use(securityHeaders());

  // MongoDB query injection prevention
  app.use(mongoSanitize());

  // XSS protection
  app.use(xss());

  // Request sanitization
  app.use(sanitizeRequest());

  // Trust proxy (for accurate IP addresses)
  app.set('trust proxy', 1);
};

module.exports = {
  configureSecurity,
  securityHeaders,
  sanitizeRequest,
  throttleRequest,
  fileUploadSecurity,
  validateApiKey
};
