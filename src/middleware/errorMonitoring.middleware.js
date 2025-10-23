
const Sentry = require('@sentry/node');
const { ProfilingIntegration } = require('@sentry/profiling-node');

// Initialize Sentry
const initializeSentry = (app) => {
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      integrations: [
        // Enable HTTP calls tracing
        new Sentry.Integrations.Http({ tracing: true }),
        // Enable Express.js middleware tracing
        new Sentry.Integrations.Express({ app }),
        // Enable profiling
        new ProfilingIntegration()
      ],
      // Performance Monitoring
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      // Profiling sample rate
      profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      environment: process.env.NODE_ENV || 'development',

      // Filter sensitive data
      beforeSend(event, _hint) {
        // Filter out sensitive data from errors
        if (event.request) {
          // Remove authorization headers
          if (event.request.headers) {
            delete event.request.headers.authorization;
            delete event.request.headers['x-api-key'];
          }

          // Remove sensitive body data
          if (event.request.data) {
            const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'creditCard'];
            sensitiveFields.forEach(field => {
              if (event.request.data[field]) {
                event.request.data[field] = '[REDACTED]';
              }
            });
          }
        }

        // Don't send events in development unless explicitly enabled
        if (process.env.NODE_ENV === 'development' && !process.env.SENTRY_DEV_ENABLED) {
          return null;
        }

        return event;
      },

      // Ignore certain errors
      ignoreErrors: [
        // Browser errors
        'ResizeObserver loop limit exceeded',
        'Non-Error promise rejection captured',
        // Network errors
        'Network request failed',
        'NetworkError',
        'Failed to fetch',
        // User-caused errors
        'User cancelled',
        'User denied'
      ]
    });

    // RequestHandler creates a separate execution context using domains, so that every
    // transaction/span/breadcrumb is attached to its own Hub instance
    app.use(Sentry.Handlers.requestHandler());

    // TracingHandler creates a trace for every incoming request
    app.use(Sentry.Handlers.tracingHandler());

    console.log('✅ Sentry error monitoring initialized');
  }
  // Sentry disabled - no warning needed
};

// Custom error logger
const logError = (error, context = {}) => {
  // Log to console in development
  if (process.env.NODE_ENV !== 'production') {
    console.error('Error:', error);
    console.error('Context:', context);
  }

  // Send to Sentry if available
  if (process.env.SENTRY_DSN) {
    Sentry.withScope((scope) => {
      // Add context
      Object.keys(context).forEach(key => {
        scope.setContext(key, context[key]);
      });

      // Capture the error
      Sentry.captureException(error);
    });
  }

  // Also log to file if needed
  logToFile(error, context);
};

// Log errors to file for backup
const fs = require('fs');
const path = require('path');

const logToFile = (error, context) => {
  const logDir = path.join(__dirname, '../logs');

  // Create logs directory if it doesn't exist
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    },
    context
  };

  const logFile = path.join(logDir, `errors-${new Date().toISOString().split('T')[0]}.log`);

  fs.appendFile(
    logFile,
    JSON.stringify(logEntry) + '\n',
    (err) => {
      if (err) {
        console.error('Failed to write to error log file:', err);
      }
    }
  );
};

// Performance monitoring
const measurePerformance = (operationName) => {
  const transaction = Sentry.getCurrentHub().getScope().getTransaction();

  if (!transaction) {
    return {
      finish: () => {}
    };
  }

  const span = transaction.startChild({
    op: operationName,
    description: `Measuring ${operationName}`
  });

  return {
    finish: () => span.finish(),
    setData: (key, value) => span.setData(key, value),
    setStatus: (status) => span.setStatus(status)
  };
};

// User context tracking
const setUserContext = (user) => {
  if (user && process.env.SENTRY_DSN) {
    Sentry.setUser({
      id: user._id.toString(),
      email: user.email,
      username: user.username,
      role: user.role
    });
  }
};

// Clear user context
const clearUserContext = () => {
  if (process.env.SENTRY_DSN) {
    Sentry.setUser(null);
  }
};

// Custom error types for better tracking
class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.statusCode = 400;
  }
}

class AuthenticationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthenticationError';
    this.statusCode = 401;
  }
}

class AuthorizationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthorizationError';
    this.statusCode = 403;
  }
}

class NotFoundError extends Error {
  constructor(resource) {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
    this.resource = resource;
    this.statusCode = 404;
  }
}

class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
    this.statusCode = 409;
  }
}

class RateLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RateLimitError';
    this.statusCode = 429;
  }
}

// Error handler middleware (should be last)
const errorHandler = () => {
  // Check if Sentry is initialized
  if (!Sentry || !Sentry.Handlers) {
    // Return a basic error handler if Sentry is not available
    return (err, req, res, _next) => {
      console.error('Error:', err);
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'Internal server error'
      });
    };
  }

  return Sentry.Handlers.errorHandler({
    shouldHandleError(error) {
      // Capture all errors with status 500 or above
      if (error.statusCode >= 500) {
        return true;
      }

      // Also capture specific error types
      const captureErrorTypes = [
        'MongoError',
        'ValidationError',
        'CastError',
        'TypeError',
        'ReferenceError'
      ];

      return captureErrorTypes.includes(error.name);
    }
  });
};

// Health check for monitoring
const getMonitoringHealth = () => {
  return {
    sentry: {
      enabled: !!process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV
    },
    errorLogs: {
      directory: path.join(__dirname, '../logs'),
      exists: fs.existsSync(path.join(__dirname, '../logs'))
    }
  };
};

module.exports = {
  initializeSentry,
  logError,
  measurePerformance,
  setUserContext,
  clearUserContext,
  errorHandler,
  getMonitoringHealth,
  // Custom error classes
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError
};
