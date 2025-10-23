const { v4: uuidv4 } = require('uuid');

/**
 * Generate a correlation ID for request tracking
 * @returns {string} UUID v4 correlation ID
 */
const generateCorrelationId = () => {
  return uuidv4();
};

/**
 * Extract correlation ID from request headers
 * @param {Object} req - Express request object
 * @returns {string|null} Correlation ID if found
 */
const extractCorrelationId = (req) => {
  // Check various header names commonly used for correlation IDs
  const headerNames = [
    'x-correlation-id',
    'x-request-id',
    'x-trace-id',
    'correlation-id',
    'request-id'
  ];

  for (const headerName of headerNames) {
    if (req.headers[headerName]) {
      return req.headers[headerName];
    }
  }

  return null;
};

/**
 * Correlation ID middleware
 * Adds a correlation ID to each request for tracking through the system
 */
const correlationIdMiddleware = (options = {}) => {
  const {
    headerName = 'x-correlation-id',
    generator = generateCorrelationId,
    passThrough = true // Whether to pass through existing correlation IDs
  } = options;

  return (req, res, next) => {
    // Try to extract existing correlation ID if passThrough is enabled
    let correlationId = passThrough ? extractCorrelationId(req) : null;

    // Generate new ID if none exists
    if (!correlationId) {
      correlationId = generator();
    }

    // Attach to request object
    req.correlationId = correlationId;
    req.id = correlationId; // Alias for convenience

    // Attach to response locals for logging
    res.locals.correlationId = correlationId;

    // Add to response headers
    res.setHeader(headerName, correlationId);
    res.setHeader('X-Request-ID', correlationId);

    // Add to request headers for downstream services
    req.headers[headerName] = correlationId;

    // Make available in async context (if using async_hooks)
    if (req.asyncContext) {
      req.asyncContext.set('correlationId', correlationId);
    }

    next();
  };
};

/**
 * Logger wrapper to include correlation ID
 * @param {Object} logger - Base logger instance
 * @returns {Object} Wrapped logger
 */
const wrapLogger = (logger) => {
  const wrappedLogger = {};

  ['debug', 'info', 'warn', 'error', 'log'].forEach(level => {
    wrappedLogger[level] = (message, meta = {}) => {
      const correlationId =
        meta.correlationId ||
        meta.req?.correlationId ||
        meta.res?.locals?.correlationId;

      if (correlationId) {
        meta.correlationId = correlationId;
      }

      logger[level](message, meta);
    };
  });

  return wrappedLogger;
};

/**
 * Express request logger with correlation ID
 * @returns {Function} Logger middleware
 */
const requestLogger = () => {
  return (req, res, next) => {
    const start = Date.now();
    const correlationId = req.correlationId || 'unknown';

    // Log request
    console.log(`[${correlationId}] ${req.method} ${req.originalUrl} - Request started`);

    // Log response when finished
    res.on('finish', () => {
      const duration = Date.now() - start;
      const status = res.statusCode;
      const level = status >= 400 ? 'error' : 'info';

      console[level](
        `[${correlationId}] ${req.method} ${req.originalUrl} - ${status} (${duration}ms)`
      );
    });

    next();
  };
};

/**
 * Mongoose plugin to add correlation ID to queries
 * @param {Object} schema - Mongoose schema
 */
const mongooseCorrelationPlugin = (schema) => {
  // Add correlation ID to query context
  schema.pre(['find', 'findOne', 'findOneAndUpdate', 'updateOne', 'updateMany'], function() {
    const correlationId = this.getOptions().correlationId;
    if (correlationId) {
      this.comment(`CorrelationID: ${correlationId}`);
    }
  });

  // Add method to set correlation ID on queries
  schema.query.withCorrelationId = function(correlationId) {
    return this.setOptions({ correlationId });
  };
};

/**
 * Get correlation ID from various sources
 * @param {Object} context - Context object (req, res, or custom object)
 * @returns {string|null} Correlation ID if found
 */
const getCorrelationId = (context) => {
  if (!context) {
    return null;
  }

  // From request object
  if (context.correlationId) {
    return context.correlationId;
  }
  if (context.id) {
    return context.id;
  }

  // From response locals
  if (context.locals?.correlationId) {
    return context.locals.correlationId;
  }

  // From headers
  if (context.headers) {
    return extractCorrelationId(context);
  }

  // From nested request/response
  if (context.req?.correlationId) {
    return context.req.correlationId;
  }
  if (context.res?.locals?.correlationId) {
    return context.res.locals.correlationId;
  }

  return null;
};

/**
 * Async context manager for correlation IDs
 * Useful for maintaining correlation ID across async boundaries
 */
class CorrelationContext {
  constructor() {
    this.storage = new Map();
  }

  run(correlationId, fn) {
    const previousId = this.storage.get('current');
    this.storage.set('current', correlationId);

    try {
      return fn();
    } finally {
      if (previousId) {
        this.storage.set('current', previousId);
      } else {
        this.storage.delete('current');
      }
    }
  }

  get() {
    return this.storage.get('current');
  }

  set(correlationId) {
    this.storage.set('current', correlationId);
  }
}

// Create a global context instance
const correlationContext = new CorrelationContext();

module.exports = {
  correlationIdMiddleware,
  generateCorrelationId,
  extractCorrelationId,
  getCorrelationId,
  wrapLogger,
  requestLogger,
  mongooseCorrelationPlugin,
  correlationContext
};
