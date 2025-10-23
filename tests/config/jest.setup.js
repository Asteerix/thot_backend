const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongoServer;

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.JWT_EXPIRE = '7d';
process.env.PORT = 5001;
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.UPLOAD_PATH = './uploads/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.EMAIL_FROM = 'test@thot.com';
process.env.SMTP_HOST = 'smtp.test.com';
process.env.SMTP_PORT = '587';
process.env.SMTP_USER = 'test@thot.com';
process.env.SMTP_PASS = 'testpassword';
process.env.SENTRY_DSN = '';
process.env.LOG_LEVEL = 'error';

// Mock Redis
jest.mock('ioredis', () => require('ioredis-mock'));

// Mock Sentry
jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  configureScope: jest.fn(),
  withScope: jest.fn(),
  setContext: jest.fn(),
  setTag: jest.fn(),
  setUser: jest.fn(),
  startTransaction: jest.fn()
}));

// Mock nodemailer
jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
    verify: jest.fn().mockResolvedValue(true)
  })
}));

// Mock multer
jest.mock('multer', () => {
  const multer = () => ({
    single: () => (req, res, next) => {
      req.file = {
        fieldname: 'file',
        originalname: 'test.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        destination: './uploads/test',
        filename: 'test-' + Date.now() + '.jpg',
        path: './uploads/test/test.jpg',
        size: 1024
      };
      next();
    },
    array: () => (req, res, next) => {
      req.files = [{
        fieldname: 'files',
        originalname: 'test.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        destination: './uploads/test',
        filename: 'test-' + Date.now() + '.jpg',
        path: './uploads/test/test.jpg',
        size: 1024
      }];
      next();
    },
    fields: () => (req, res, next) => {
      req.files = {};
      next();
    },
    none: () => (req, res, next) => next(),
    any: () => (req, res, next) => {
      req.files = [];
      next();
    }
  });
  multer.diskStorage = () => ({});
  multer.memoryStorage = () => ({});
  return multer;
});

// Mock sharp for image processing
jest.mock('sharp', () => {
  return () => ({
    resize: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    png: jest.fn().mockReturnThis(),
    webp: jest.fn().mockReturnThis(),
    toFile: jest.fn().mockResolvedValue({ format: 'jpeg', width: 800, height: 600 }),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('mock-image-data')),
    metadata: jest.fn().mockResolvedValue({ width: 1920, height: 1080, format: 'jpeg' })
  });
});

// Mock fluent-ffmpeg for video processing
jest.mock('fluent-ffmpeg', () => {
  const ffmpeg = jest.fn(() => ({
    input: jest.fn().mockReturnThis(),
    output: jest.fn().mockReturnThis(),
    outputOptions: jest.fn().mockReturnThis(),
    on: jest.fn().mockImplementation(function(event, callback) {
      if (event === 'end') {
        setTimeout(() => callback(), 100);
      }
      return this;
    }),
    run: jest.fn().mockReturnThis(),
    screenshots: jest.fn().mockReturnThis(),
    ffprobe: jest.fn((callback) => {
      callback(null, {
        format: { duration: 120 },
        streams: [{ codec_type: 'video', width: 1920, height: 1080 }]
      });
    })
  }));
  ffmpeg.ffprobe = jest.fn((file, callback) => {
    callback(null, {
      format: { duration: 120 },
      streams: [{ codec_type: 'video', width: 1920, height: 1080 }]
    });
  });
  return ffmpeg;
});

beforeAll(async () => {
  try {
    // Close any existing connections
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    // Create MongoDB Memory Server
    mongoServer = await MongoMemoryServer.create({
      binary: {
        version: '6.0.0'
      }
    });

    const mongoUri = mongoServer.getUri();

    // Connect to MongoDB Memory Server
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
  } catch (error) {
    console.error('Setup error:', error);
    throw error;
  }
});

afterAll(async () => {
  try {
    // Close mongoose connection
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    // Stop MongoDB Memory Server
    if (mongoServer) {
      await mongoServer.stop();
    }
  } catch (error) {
    console.error('Teardown error:', error);
  }
});

afterEach(async () => {
  try {
    // Clean up all collections
    if (mongoose.connection.readyState !== 0) {
      const collections = mongoose.connection.collections;

      for (const key in collections) {
        const collection = collections[key];
        await collection.deleteMany({});
      }
    }

    // Clear all mocks
    jest.clearAllMocks();
  } catch (error) {
    console.error('Clean up error:', error);
  }
});

// Set timeout
jest.setTimeout(30000);

// Mock console to reduce noise
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  // Keep error and warn for debugging
  error: console.error,
  warn: console.warn
};
