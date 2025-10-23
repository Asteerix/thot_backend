const { body, param, query, validationResult } = require('express-validator');
const { URL } = require('url');

// Middleware to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

// Common validators
const validators = {
  // ID validation
  mongoId: (field = 'id') => param(field)
    .isMongoId()
    .withMessage('Invalid ID format'),

  // Pagination
  pagination: () => [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer')
      .toInt(),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
      .toInt()
  ],

  // Auth validators
  email: () => body('email')
    .trim()
    .toLowerCase()
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail(),

  password: () => body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/)
    .withMessage('Password must contain at least one lowercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain at least one number')
    .matches(/[!@#$%^&*(),.?":{}|<>]/)
    .withMessage('Password must contain at least one special character'),

  username: () => body('username')
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers and underscores'),

  // Content validators
  title: (required = true) => {
    const validator = body('title').trim();
    if (required) {
      return validator
        .notEmpty()
        .withMessage('Title is required')
        .isLength({ min: 3, max: 200 })
        .withMessage('Title must be between 3 and 200 characters');
    }
    return validator
      .optional()
      .isLength({ min: 3, max: 200 })
      .withMessage('Title must be between 3 and 200 characters');
  },

  content: (field = 'content', required = true, maxLength = 5000) => {
    const validator = body(field).trim();
    if (required) {
      return validator
        .notEmpty()
        .withMessage(`${field} is required`)
        .isLength({ max: maxLength })
        .withMessage(`${field} must not exceed ${maxLength} characters`);
    }
    return validator
      .optional()
      .isLength({ max: maxLength })
      .withMessage(`${field} must not exceed ${maxLength} characters`);
  },

  // Post type validator
  postType: () => body('type')
    .optional()
    .isIn(['article', 'video', 'podcast', 'short', 'question'])
    .withMessage('Invalid post type'),

  // URL validator
  url: (field, required = false) => {
    const validator = body(field).trim();
    if (required) {
      return validator
        .notEmpty()
        .withMessage(`${field} is required`)
        .custom(value => {
          // Accept both full URLs and relative paths for video/media URLs
          if (field === 'videoUrl' || field === 'thumbnailUrl' || field === 'imageUrl') {
            // Accept relative paths starting with /uploads/
            if (value.startsWith('/uploads/')) {
              return true;
            }
          }
          // Otherwise validate as URL
          try {
            new URL(value);
            return true;
          } catch {
            return false;
          }
        })
        .withMessage(`${field} must be a valid URL or path`);
    }
    return validator
      .optional()
      .custom(value => {
        // Accept both full URLs and relative paths for video/media URLs
        if (field === 'videoUrl' || field === 'thumbnailUrl' || field === 'imageUrl') {
          // Accept relative paths starting with /uploads/
          if (value.startsWith('/uploads/')) {
            return true;
          }
        }
        // Otherwise validate as URL
        try {
          new URL(value);
          return true;
        } catch {
          return false;
        }
      })
      .withMessage(`${field} must be a valid URL or path`);
  },

  // Array validators
  stringArray: (field, required = false) => {
    const validator = body(field);
    if (required) {
      return validator
        .notEmpty()
        .withMessage(`${field} is required`)
        .isArray()
        .withMessage(`${field} must be an array`);
    }
    return validator
      .optional()
      .isArray()
      .withMessage(`${field} must be an array`);
  },

  // Date validators
  date: (field, required = false) => {
    const validator = body(field);
    if (required) {
      return validator
        .notEmpty()
        .withMessage(`${field} is required`)
        .isISO8601()
        .withMessage(`${field} must be a valid date`);
    }
    return validator
      .optional()
      .isISO8601()
      .withMessage(`${field} must be a valid date`);
  },

  // Sanitizers
  sanitizeHtml: (field) => body(field)
    .customSanitizer(value => {
      if (!value) {
        return value;
      }
      // Remove script tags and dangerous attributes
      return value
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
        .replace(/on\w+\s*=\s*'[^']*'/gi, '')
        .replace(/javascript:/gi, '');
    })
};

// Validation rules for different routes
const validationRules = {
  // Auth routes
  register: [
    validators.email(),
    validators.password(),
    // Username is only required for regular users, not journalists
    body('username')
      .if((value, { req }) => !req.body.isJournalist)
      .trim()
      .isLength({ min: 3, max: 30 })
      .withMessage('Username must be between 3 and 30 characters')
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Username can only contain letters, numbers and underscores'),
    body('isJournalist').optional().isBoolean(),
    body('name')
      .if((value, { req }) => req.body.isJournalist)
      .trim()
      .notEmpty()
      .withMessage('Name is required for journalists'),
    body('organization').optional().trim().notEmpty().withMessage('Organization is required for journalists'),
    body('pressCard').optional().matches(/^\d{4,}$/).withMessage('Invalid press card format'),
    handleValidationErrors
  ],

  login: [
    validators.email(),
    body('password').notEmpty().withMessage('Password is required'),
    handleValidationErrors
  ],

  changePassword: [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    validators.password().customSanitizer(() => 'newPassword'),
    handleValidationErrors
  ],

  // Post routes
  createPost: [
    validators.title(),
    validators.content('content', true, 10000),
    validators.postType(),
    validators.stringArray('tags'),
    validators.url('videoUrl', false),
    validators.url('podcastUrl', false),
    validators.sanitizeHtml('content'),
    handleValidationErrors
  ],

  updatePost: [
    validators.mongoId(),
    validators.title(false),
    validators.content('content', false, 10000),
    validators.postType(),
    validators.stringArray('tags'),
    validators.sanitizeHtml('content'),
    handleValidationErrors
  ],

  // Comment routes
  createComment: [
    validators.mongoId('postId'),
    validators.content('content', true, 1000),
    validators.sanitizeHtml('content'),
    handleValidationErrors
  ],

  // Question routes
  createQuestion: [
    validators.content('content', true, 500),
    body('options').optional().isArray().withMessage('Options must be an array'),
    body('options.*.text').notEmpty().withMessage('Option text is required'),
    validators.date('expiresAt', false),
    handleValidationErrors
  ],

  voteQuestion: [
    validators.mongoId(),
    body('optionId').notEmpty().withMessage('Option ID is required'),
    handleValidationErrors
  ],

  // Short routes
  createShort: [
    validators.title(),
    validators.content('description', false, 500),
    validators.url('videoUrl', true),
    body('duration').optional().isInt({ min: 1, max: 180 }).withMessage('Duration must be between 1 and 180 seconds'),
    validators.stringArray('tags'),
    handleValidationErrors
  ],

  // Report routes
  createReport: [
    body('targetType').isIn(['post', 'comment', 'user', 'short']).withMessage('Invalid target type'),
    body('targetId').isMongoId().withMessage('Invalid target ID'),
    body('reason').isIn(['spam', 'harassment', 'hate_speech', 'violence', 'false_information', 'inappropriate_content', 'copyright', 'other']).withMessage('Invalid reason'),
    body('description')
      .optional({ checkFalsy: false })
      .isLength({ max: 500 })
      .withMessage('Description must not exceed 500 characters')
      .custom((value, { req }) => {
        // If reason is 'other', description is required
        if (req.body.reason === 'other' && (!value || value.trim().length === 0)) {
          throw new Error('Description is required when reason is "other"');
        }
        return true;
      }),
    handleValidationErrors
  ],

  // Problem report routes
  createProblemReport: [
    body('category').isIn(['bug', 'feature', 'performance', 'security', 'other']).withMessage('Invalid category'),
    validators.content('description', true, 2000),
    body('deviceInfo').optional().isObject().withMessage('Device info must be an object'),
    handleValidationErrors
  ],

  // Formation routes
  addFormation: [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('institution').trim().notEmpty().withMessage('Institution is required'),
    body('year').isInt({ min: 1900, max: new Date().getFullYear() }).withMessage('Invalid year'),
    validators.content('description', false, 500),
    handleValidationErrors
  ],

  // Experience routes
  addExperience: [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('company').trim().notEmpty().withMessage('Company is required'),
    body('location').optional().trim(),
    validators.date('startDate', true),
    validators.date('endDate', false),
    body('current').optional().isBoolean(),
    validators.content('description', false, 1000),
    handleValidationErrors
  ],

  // Pagination
  paginated: [
    ...validators.pagination(),
    handleValidationErrors
  ]
};

module.exports = {
  validators,
  validationRules,
  handleValidationErrors
};
