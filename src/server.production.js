/**
 * Server Production Wrapper pour Clever Cloud
 * Ce wrapper permet au serveur de démarrer même si MongoDB n'est pas encore disponible
 * et continue de réessayer en arrière-plan
 */

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
require('dotenv').config();

const { cleverHealthCheck, detailedHealthCheck } = require('./healthcheck');

console.log('🚀 Starting Thot Backend in Production Mode...');
console.log('📋 Environment Check:');
console.log('  - NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('  - PORT:', process.env.PORT || 'not set (will use 8080)');
console.log('  - MONGODB_URI:', process.env.MONGODB_URI ? '✓ set' : '❌ not set');
console.log('  - JWT_SECRET:', process.env.JWT_SECRET ? '✓ set' : '❌ not set');

const app = express();

// Import middlewares et configuration
const { generalLimiter } = require('./middleware/rateLimiter.middleware');
const { configureSecurity } = require('./middleware/security.middleware');
const { initializeSentry, errorHandler } = require('./middleware/errorMonitoring.middleware');
const { correlationIdMiddleware, requestLogger } = require('./middleware/correlationId.middleware');
const performanceMonitor = require('./middleware/performance.middleware');
const { defaultImageMiddleware } = require('./middleware/defaultImage.middleware');
const { connectDB } = require('./config/database');

// Initialize Sentry
initializeSentry(app);

// Apply middlewares
app.use(correlationIdMiddleware());
configureSecurity(app);
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// Logging
morgan.token('correlation-id', (req) => req.correlationId || 'no-id');
const logFormat = '[:correlation-id] :method :url :status :response-time ms';
app.use(morgan(logFormat));
app.use(requestLogger());
app.use(performanceMonitor.middleware());

// CORS
app.use(cors({
  origin: process.env.CLIENT_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== HEALTH CHECKS =====
// Health check pour Clever Cloud - retourne toujours 200
app.get('/health', cleverHealthCheck);

// Health check détaillé pour monitoring
app.get('/api/health', detailedHealthCheck);

// Basic status endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Thot Backend API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// Static files
app.use('/uploads', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
}, express.static(path.join(__dirname, '../uploads')), defaultImageMiddleware);

app.use('/assets', express.static(path.join(__dirname, 'public/assets')));

// Database connection state
let isDbConnected = false;
let dbConnectionAttempts = 0;
const MAX_DB_RETRIES = 10;

mongoose.connection.on('connected', () => {
  console.log('✅ MongoDB connected successfully');
  isDbConnected = true;
  dbConnectionAttempts = 0;
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err.message);
  isDbConnected = false;
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️  MongoDB disconnected');
  isDbConnected = false;
});

/**
 * Tentative de connexion MongoDB en arrière-plan
 * Ne bloque PAS le démarrage du serveur
 */
const connectDatabaseAsync = async () => {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI not configured! Database features will be unavailable.');
    console.error('   Please set MONGODB_URI environment variable in Clever Cloud console.');
    return;
  }

  while (dbConnectionAttempts < MAX_DB_RETRIES && !isDbConnected) {
    dbConnectionAttempts++;
    console.log(`🔄 Attempting MongoDB connection (${dbConnectionAttempts}/${MAX_DB_RETRIES})...`);

    try {
      await connectDB(process.env.MONGODB_URI);

      // Créer admin users après connexion
      const createAdminUser = async () => {
        try {
          const User = require('./models/user.model');
          const admins = [
            { username: 'admin', email: 'apoltavtseef@gmail.com', password: 'elmer777' },
            { username: 'lucas_admin', email: 'lucas@admin.com', password: 'Amaury262879?', name: 'Lucas Admin' }
          ];

          for (const admin of admins) {
            const existing = await User.findOne({ email: admin.email });
            if (!existing) {
              const newAdmin = new User({ ...admin, role: 'admin', verified: true, status: 'active' });
              await newAdmin.save();
              console.log(`✅ Admin user created: ${admin.email}`);
            }
          }
        } catch (err) {
          console.error('⚠️  Error creating admin users:', err.message);
        }
      };

      await createAdminUser();

      // Start report monitor
      try {
        const reportMonitorService = require('./services/reportMonitor.service');
        reportMonitorService.start();
        console.log('✅ Report monitor service started');
      } catch (err) {
        console.error('⚠️  Report monitor service not started:', err.message);
      }

      break; // Connexion réussie, sortir de la boucle
    } catch (err) {
      console.error(`❌ MongoDB connection attempt ${dbConnectionAttempts} failed:`, err.message);

      if (dbConnectionAttempts < MAX_DB_RETRIES) {
        const waitTime = Math.min(1000 * Math.pow(2, dbConnectionAttempts), 30000);
        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        console.error('❌ Max MongoDB connection retries reached');
        console.error('   Server will continue running but database features will be unavailable');
        console.error('   Please check your MONGODB_URI configuration in Clever Cloud');
      }
    }
  }
};

// Lancer la connexion DB en arrière-plan
connectDatabaseAsync().catch(err => {
  console.error('❌ Unexpected error during database connection:', err);
});

// Routes - charger seulement si les modules existent
const loadRoutes = () => {
  try {
    app.use('/api/', generalLimiter);
    app.use('/api/auth', require('./routes/auth.routes'));
    app.use('/api/posts', require('./routes/post.routes'));
    app.use('/api/users', require('./routes/user.routes'));
    app.use('/api/journalists', require('./routes/journalist.routes'));
    app.use('/api/upload', require('./routes/upload.routes'));
    app.use('/api/admin', require('./routes/admin.routes'));
    app.use('/api/comments', require('./routes/comment.routes'));
    app.use('/api/shorts', require('./routes/short.routes'));
    app.use('/api/questions', require('./routes/question.routes'));
    app.use('/api/trending', require('./routes/trending.routes'));
    app.use('/api/reports', require('./routes/report.routes'));
    app.use('/api/notifications', require('./routes/notification.routes'));
    app.use('/api/subscriptions', require('./routes/subscription.routes'));
    console.log('✅ All routes loaded successfully');
  } catch (err) {
    console.error('❌ Error loading routes:', err);
  }
};

loadRoutes();

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.path
  });
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n⚠️  ${signal} received, shutting down gracefully...`);

  server.close(() => {
    console.log('✅ HTTP server closed');
  });

  try {
    if (isDbConnected) {
      await mongoose.connection.close();
      console.log('✅ MongoDB connection closed');
    }
  } catch (err) {
    console.error('❌ Error closing MongoDB:', err);
  }

  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🎉 Thot Backend Started Successfully');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Port:        ${PORT}`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'production'}`);
  console.log(`  Time:        ${new Date().toISOString()}`);
  console.log(`  Health:      http://localhost:${PORT}/health`);
  console.log(`  Database:    ${isDbConnected ? '✅ Connected' : '⏳ Connecting...'}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
});

// Initialize Socket.IO
try {
  const socketService = require('./services/socket.service');
  socketService.initialize(server);
  console.log('✅ Socket.IO initialized');
} catch (err) {
  console.error('⚠️  Socket.IO initialization failed:', err.message);
}

module.exports = app;
