const request = require('supertest');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../../src/models/user.model');
const { connectDB, closeDB, clearDB } = require('../setup/testDb');

// Create a minimal Express app for testing
const app = express();
app.use(express.json());

// Mock rate limiters to avoid actual rate limiting in tests
jest.mock('../../src/middleware/rateLimiter.middleware', () => ({
  limiters: {
    register: (req, res, next) => next(),
    auth: (req, res, next) => next(),
    api: (req, res, next) => next(),
    write: (req, res, next) => next(),
    passwordReset: (req, res, next) => next(),
  }
}));

// Import routes after mocking
const authRoutes = require('../../src/routes/auth.routes');
app.use('/api/auth', authRoutes);

describe('Authentication API Tests', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await closeDB();
  });

  afterEach(async () => {
    await clearDB();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        name: 'Test User'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data.user).toHaveProperty('username', userData.username);
      expect(response.body.data.user).not.toHaveProperty('password');
    });

    it('should fail to register with existing email', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        name: 'Test User'
      };

      // Register first user
      await request(app)
        .post('/api/auth/register')
        .send(userData);

      // Try to register with same email
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          ...userData,
          username: 'testuser2'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/already|exists|registered/i);
    });

    it('should fail to register with existing username', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        name: 'Test User'
      };

      // Register first user
      await request(app)
        .post('/api/auth/register')
        .send(userData);

      // Try to register with same username
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          ...userData,
          email: 'test2@example.com'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/already|exists|registered/i);
    });

    it('should fail to register without required fields', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Create a test user
      const hashedPassword = await bcrypt.hash('Password123!', 10);
      await User.create({
        username: 'testuser',
        email: 'test@example.com',
        password: hashedPassword,
        name: 'Test User',
        isActive: true
      });
    });

    it('should login successfully with correct credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'Password123!'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data.user).toHaveProperty('username');
      expect(response.body.data.user).not.toHaveProperty('password');
    });

    it('should fail to login with incorrect password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'WrongPassword123!'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid');
    });

    it('should fail to login with non-existent email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'Password123!'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid');
    });
  });

  describe('GET /api/auth/profile', () => {
    let token;
    let userId;

    beforeEach(async () => {
      // Create a test user
      const hashedPassword = await bcrypt.hash('Password123!', 10);
      const user = await User.create({
        username: 'testuser',
        email: 'test@example.com',
        password: hashedPassword,
        name: 'Test User',
        isActive: true
      });
      userId = user._id;

      // Generate token
      token = jwt.sign(
        { userId: user._id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
      );
    });

    it('should get user profile with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data.user).toHaveProperty('username');
      expect(response.body.data.user).not.toHaveProperty('password');
    });

    it('should fail to get profile without token', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should fail to get profile with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/change-password', () => {
    let token;
    let user;

    beforeEach(async () => {
      // Create a test user
      const hashedPassword = await bcrypt.hash('Password123!', 10);
      user = await User.create({
        username: 'testuser',
        email: 'test@example.com',
        password: hashedPassword,
        name: 'Test User',
        isActive: true
      });

      // Generate token
      token = jwt.sign(
        { userId: user._id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
      );
    });

    it('should change password successfully with correct old password', async () => {
      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          oldPassword: 'Password123!',
          newPassword: 'NewPassword123!'
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify password was changed
      const updatedUser = await User.findById(user._id);
      const isPasswordValid = await bcrypt.compare('NewPassword123!', updatedUser.password);
      expect(isPasswordValid).toBe(true);
    });

    it('should fail to change password with incorrect old password', async () => {
      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          oldPassword: 'WrongPassword123!',
          newPassword: 'NewPassword123!'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });
});
