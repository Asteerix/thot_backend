const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',

  mongodb: {
    uri: process.env.MONGODB_ADDON_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/thot_journalism',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000
    }
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'default_dev_secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d'
  },

  api: {
    baseUrl: process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
    version: process.env.API_VERSION || 'v1'
  },

  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100')
  },

  uploads: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800'), // 50MB
    uploadPath: path.join(__dirname, '../uploads')
  },

  public: {
    path: path.join(__dirname, '../public')
  }
};

module.exports = config;