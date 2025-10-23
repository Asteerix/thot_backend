const mongoose = require('mongoose');

// Default connection options with pooling
const defaultOptions = {
  // Connection pooling
  maxPoolSize: 10, // Maximum number of sockets
  minPoolSize: 2,  // Minimum number of sockets
  maxIdleTimeMS: 10000, // Close sockets after 10 seconds of inactivity

  // Server selection
  serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
  heartbeatFrequencyMS: 10000, // Check server status every 10s

  // Socket options
  socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
  family: 4, // Use IPv4, skip trying IPv6

  // Write concern
  w: 'majority',
  wtimeoutMS: 2500,
  journal: true,

  // Read preference
  readPreference: 'primaryPreferred',
  readConcern: { level: 'majority' },

  // Retry options
  retryWrites: true,
  retryReads: true,

  // Compression
  compressors: ['snappy', 'zlib'],

  // Other options
  directConnection: false,
  appName: 'thot-backend'
};

/**
 * Connect to MongoDB with enhanced configuration
 * @param {string} uri - MongoDB connection URI
 * @param {Object} options - Additional connection options
 * @returns {Promise} Connection promise
 */
const connectDB = async (uri, options = {}) => {
  const connectionOptions = {
    ...defaultOptions,
    ...options
  };

  try {
    // Set mongoose options
    mongoose.set('strictQuery', true);
    mongoose.set('strictPopulate', false); // Disable strict populate globally
    mongoose.set('debug', process.env.NODE_ENV === 'development');

    // Connect to MongoDB
    await mongoose.connect(uri || process.env.MONGODB_URI, connectionOptions);

    console.log('✅ MongoDB connected successfully');
    console.log(`📊 Connection pool: min=${connectionOptions.minPoolSize}, max=${connectionOptions.maxPoolSize}`);

    // Monitor connection pool
    monitorConnectionPool();

    return mongoose.connection;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    throw error;
  }
};

/**
 * Monitor connection pool statistics
 */
const monitorConnectionPool = () => {
  // Log initial pool stats
  logPoolStats();

  // Monitor pool stats periodically in development
  if (process.env.NODE_ENV === 'development') {
    setInterval(logPoolStats, 60000); // Every minute
  }
};

/**
 * Log connection pool statistics
 */
const logPoolStats = () => {
  const db = mongoose.connection;

  if (db.readyState === 1 && db.client) {
    try {
      const topology = db.client.topology;
      if (topology && topology.s && topology.s.servers) {
        const servers = topology.s.servers;

        servers.forEach((server, address) => {
          if (server.s && server.s.pool) {
            const pool = server.s.pool;
            console.log(`[MongoDB Pool Stats] ${address}:`, {
              available: pool.availableConnectionCount,
              pending: pool.pendingConnectionCount,
              current: pool.currentConnectionCount,
              active: pool.activeConnectionCount
            });
          }
        });
      }
    } catch {
      // Silently ignore if we can't access pool stats
    }
  }
};

/**
 * Get connection status and statistics
 * @returns {Object} Connection status and pool statistics
 */
const getConnectionStatus = () => {
  const db = mongoose.connection;

  const status = {
    connected: db.readyState === 1,
    readyState: getReadyStateName(db.readyState),
    host: db.host || 'unknown',
    name: db.name || 'unknown',
    poolStats: null
  };

  // Try to get pool statistics
  if (db.readyState === 1 && db.client) {
    try {
      const topology = db.client.topology;
      if (topology && topology.s && topology.s.servers) {
        const poolStats = {
          servers: []
        };

        topology.s.servers.forEach((server, address) => {
          if (server.s && server.s.pool) {
            const pool = server.s.pool;
            poolStats.servers.push({
              address,
              available: pool.availableConnectionCount,
              pending: pool.pendingConnectionCount,
              current: pool.currentConnectionCount,
              active: pool.activeConnectionCount
            });
          }
        });

        status.poolStats = poolStats;
      }
    } catch {
      // Ignore errors getting pool stats
    }
  }

  return status;
};

/**
 * Get ready state name
 * @param {number} state - Mongoose ready state
 * @returns {string} State name
 */
const getReadyStateName = (state) => {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
    99: 'uninitialized'
  };
  return states[state] || 'unknown';
};

/**
 * Gracefully close database connection
 * @returns {Promise} Close promise
 */
const closeDB = async () => {
  try {
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed gracefully');
  } catch (error) {
    console.error('❌ Error closing MongoDB connection:', error);
    throw error;
  }
};

/**
 * Handle connection events
 */
const setupConnectionHandlers = () => {
  const db = mongoose.connection;

  db.on('connected', () => {
    console.log('📗 MongoDB connected');
  });

  db.on('error', (err) => {
    console.error('📕 MongoDB connection error:', err);
  });

  db.on('disconnected', () => {
    console.log('📙 MongoDB disconnected');
  });

  db.on('reconnected', () => {
    console.log('📗 MongoDB reconnected');
  });

  db.on('close', () => {
    console.log('📓 MongoDB connection closed');
  });

  // Monitor replica set events
  db.on('fullsetup', () => {
    console.log('📚 MongoDB replica set fully connected');
  });

  db.on('all', () => {
    console.log('📚 MongoDB connected to all servers');
  });
};

// Setup handlers on module load
setupConnectionHandlers();

module.exports = {
  connectDB,
  closeDB,
  getConnectionStatus,
  logPoolStats,
  defaultOptions
};
