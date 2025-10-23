
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
const { generalLimiter } = require('./middleware/rateLimiter.middleware');
const { configureSecurity } = require('./middleware/security.middleware');
const { initializeSentry, errorHandler } = require('./middleware/errorMonitoring.middleware');
const { correlationIdMiddleware, requestLogger } = require('./middleware/correlationId.middleware');
const performanceMonitor = require('./middleware/performance.middleware');
const { defaultImageMiddleware } = require('./middleware/defaultImage.middleware');
const { connectDB, closeDB } = require('./config/database');
require('dotenv').config();

const app = express();

// Initialize Sentry error monitoring
initializeSentry(app);

// Apply correlation ID middleware early in the stack
app.use(correlationIdMiddleware());

// Apply security middleware
configureSecurity(app);

// Apply compression middleware
app.use(compression({
  level: 6, // Default compression level
  threshold: 1024, // Only compress responses larger than 1KB
  filter: (req, res) => {
    // Don't compress responses with this request header
    if (req.headers['x-no-compression']) {
      return false;
    }
    // Use compression by default
    return compression.filter(req, res);
  }
}));

// Custom logging format
morgan.token('body', (req) => JSON.stringify(req.body));
morgan.token('error', (req, res) => res.locals.errorMessage || '');
morgan.token('correlation-id', (req) => req.correlationId || 'no-id');

const logFormat = '[:correlation-id] :method :url :status :response-time ms - :res[content-length] :body :error';

// Logging middleware
app.use(morgan(logFormat, {
  skip: (req, res) => res.statusCode < 400,
  stream: process.stderr
}));

app.use(morgan(logFormat, {
  skip: (req, res) => res.statusCode >= 400,
  stream: process.stdout
}));

// Request tracking with correlation ID
app.use(requestLogger());

// Performance monitoring
app.use(performanceMonitor.middleware());

// CORS configuration
const corsOptions = {
  origin: '*', // Allow all origins in development
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  credentials: true,
  maxAge: 86400 // 24 hours
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint (sans /api prefix pour la découverte automatique)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Thot API is healthy',
    timestamp: new Date().toISOString(),
    database: isDbConnected ? 'connected' : 'disconnected'
  });
});

// Apply general rate limiting to all routes
app.use('/api/', generalLimiter);

// Redirect default avatar paths to assets
app.use('/uploads/default', (req, res) => {
  const filename = path.basename(req.path);
  res.redirect(301, `/assets/images/defaults/${filename}`);
});

// Serve static files from uploads directory with CORS headers and fallback
app.use('/uploads', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, '../uploads')), defaultImageMiddleware);

// Serve static files from public directory
app.use('/assets', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, 'public/assets')));

// Database connection monitoring
let isDbConnected = false;

mongoose.connection.on('connected', () => {
  console.log('MongoDB connection established');
  isDbConnected = true;
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
  isDbConnected = false;
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB connection lost');
  isDbConnected = false;
});

// Create admin user function
const createAdminUser = async () => {
  const User = require('./models/user.model');
  try {
    // Create first admin user
    const existingAdmin = await User.findOne({ email: 'apoltavtseef@gmail.com' });
    if (!existingAdmin) {
      const adminUser = new User({
        username: 'admin',
        email: 'apoltavtseef@gmail.com',
        password: 'elmer777',
        role: 'admin'
      });
      await adminUser.save();
      console.log('Admin user created successfully');
    }

    // Create lucas admin user
    const existingLucasAdmin = await User.findOne({ email: 'lucas@admin.com' });
    if (!existingLucasAdmin) {
      const lucasAdminUser = new User({
        username: 'lucas_admin',
        name: 'Lucas Admin',
        email: 'lucas@admin.com',
        password: 'Amaury262879?',
        role: 'admin',
        verified: true,
        status: 'active'
      });
      await lucasAdminUser.save();
      console.log('Lucas admin user created successfully');
    } else if (existingLucasAdmin.role !== 'admin') {
      existingLucasAdmin.role = 'admin';
      await existingLucasAdmin.save();
      console.log('Updated lucas@admin.com to admin role');
    }
  } catch (error) {
    console.error('Error creating admin user:', error);
  }
};

const initializeDatabase = async () => {
  const maxRetries = 5;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      await connectDB(process.env.MONGODB_URI);
      // Create admin user after successful connection
      await createAdminUser();
      // Start report monitoring service
      const reportMonitorService = require('./services/reportMonitor.service');
      reportMonitorService.start();
      break;
    } catch (err) {
      retries++;
      console.error(`MongoDB connection attempt ${retries} failed:`, err.message);
      if (retries === maxRetries) {
        console.error('Max retries reached. Exiting...');
        process.exit(1);
      }
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retries)));
    }
  }
};

initializeDatabase();


// Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/posts', require('./routes/post.routes'));
app.use('/api/users', require('./routes/user.routes'));
app.use('/api/journalists', require('./routes/journalist.routes'));
app.use('/api/upload', require('./routes/upload.routes'));
app.use('/api/admin', require('./routes/admin.routes')); // Add admin routes
app.use('/api/comments', require('./routes/comment.routes')); // Add comment routes
app.use('/api/shorts', require('./routes/short.routes')); // Add shorts routes
app.use('/api/questions', require('./routes/question.routes')); // Add questions routes
app.use('/api/trending', require('./routes/trending.routes')); // Add trending routes
app.use('/api/reports', require('./routes/report.routes')); // Add report routes
app.use('/api/notifications', require('./routes/notification.routes')); // Add notification routes
app.use('/api/subscriptions', require('./routes/subscription.routes')); // Add subscription routes

// Health check endpoints
app.get(['/health', '/api/health'], (req, res) => {
  try {
    const health = {
      success: true,
      status: isDbConnected ? 'ok' : 'degraded',
      timestamp: new Date(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      mongodb: {
        status: isDbConnected ? 'connected' : 'disconnected',
        host: mongoose.connection.host || 'unknown',
        name: mongoose.connection.name || 'unknown',
        readyState: mongoose.connection.readyState || 0
      },
      environment: process.env.NODE_ENV || 'development',
      version: process.version
    };

    res.status(isDbConnected ? 200 : 503).json(health);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      success: false,
      errorId: Math.random().toString(36).substring(7),
      message: 'Error checking system health'
    });
  }
});

// API Status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    apiVersion: '1.0',
    status: 'operational',
    timestamp: new Date(),
    endpoints: {
      auth: '/api/auth',
      posts: '/api/posts',
      users: '/api/users',
      journalists: '/api/journalists',
      upload: '/api/upload',
      admin: '/api/admin',
      comments: '/api/comments',
      shorts: '/api/shorts',
      questions: '/api/questions',
      health: '/api/health',
      metrics: '/api/metrics'
    }
  });
});

// Performance metrics endpoint
app.get('/api/metrics', performanceMonitor.metricsRoute());

// 404 handler with detailed logging
app.use((req, res) => {
  console.warn(`404 - Route not found: ${req.method} ${req.url}`);
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    requested: {
      method: req.method,
      path: req.path,
      timestamp: new Date()
    }
  });
});

// Enhanced error handling middleware
app.use((err, req, res, _next) => {
  const errorId = Math.random().toString(36).substring(7);

  console.error(`[Error ${errorId}] ${new Date().toISOString()}:`, {
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
    body: req.body,
    headers: req.headers,
    user: req.user ? req.user._id : 'anonymous'
  });

  // Store error message for morgan logging
  res.locals.errorMessage = `[${errorId}] ${err.message}`;

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      errorId,
      message: 'Validation Error',
      errors: Object.values(err.errors).map(e => e.message)
    });
  }

  // Mongoose cast error (invalid ID)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      errorId,
      message: 'Invalid ID format'
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    return res.status(400).json({
      success: false,
      errorId,
      message: 'Duplicate field value entered'
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      errorId,
      message: 'Invalid token'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      errorId,
      message: 'Token expired'
    });
  }

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      errorId,
      message: 'File too large'
    });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      success: false,
      errorId,
      message: 'Unexpected field'
    });
  }

  // Default error
  res.status(err.status || 500).json({
    success: false,
    errorId,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Sentry error handler (must be last)
app.use(errorHandler());

// Enhanced graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  // Track shutdown start time
  const shutdownStart = Date.now();

  try {
    // Close MongoDB connection using enhanced closeDB
    console.log('Closing MongoDB connection...');
    await closeDB();

    const shutdownDuration = Date.now() - shutdownStart;
    console.log(`Graceful shutdown completed in ${shutdownDuration}ms`);
    process.exit(0);
  } catch (err) {
    console.error('Error during graceful shutdown:', err);
    process.exit(1);
  } finally {
    // Force shutdown after timeout
    setTimeout(() => {
      console.error('Forced shutdown due to timeout');
      process.exit(1);
    }, 10000).unref();
  }
};

// Handle different termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Get network interfaces
const os = require('os');
const getNetworkIP = () => {
  const interfaces = os.networkInterfaces();
  let ipAddress = 'localhost';

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ipAddress = iface.address;
        break;
      }
    }
  }
  return ipAddress;
};

// Start server with enhanced logging
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
  const networkIP = getNetworkIP();
  console.log(`
Server started successfully:
- Port: ${PORT}
- Environment: ${process.env.NODE_ENV || 'development'}
- Time: ${new Date().toISOString()}
- Access URLs:
  * Local:    http://localhost:${PORT}
  * Network:  http://${networkIP}:${PORT}
  * Health:   http://${networkIP}:${PORT}/health
  `);
});

// Initialize Socket.IO service
const socketService = require('./services/socket.service');
socketService.initialize(server);

// Monitor server events
server.on('error', (error) => {
  console.error('Server error:', error);
});

server.on('close', () => {
  console.log('Server closed');
});
module.exports = app;
