const request = require('supertest');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../../src/models/user.model');
const Post = require('../../src/models/post.model');
const { connectDB, closeDB, clearDB } = require('../setup/testDb');

// Create a minimal Express app for testing
const app = express();
app.use(express.json());

// Mock rate limiters
jest.mock('../../src/middleware/rateLimiter.middleware', () => ({
  limiters: {
    api: (req, res, next) => next(),
    read: (req, res, next) => next(),
    write: (req, res, next) => next(),
  },
  applyLikeRateLimiters: []
}));

// Import routes after mocking
const postRoutes = require('../../src/routes/post.routes');
app.use('/api/posts', postRoutes);

describe('Posts API Tests', () => {
  let token;
  let userId;
  let journalistToken;
  let journalistId;

  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await closeDB();
  });

  beforeEach(async () => {
    await clearDB();

    // Create regular user
    const hashedPassword = await bcrypt.hash('Password123!', 10);
    const user = await User.create({
      username: 'testuser',
      email: 'test@example.com',
      password: hashedPassword,
      name: 'Test User',
      role: 'user',
      isActive: true
    });
    userId = user._id;
    token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    // Create journalist user
    const journalist = await User.create({
      username: 'journalist',
      email: 'journalist@example.com',
      password: hashedPassword,
      name: 'Test Journalist',
      role: 'journalist',
      isActive: true
    });
    journalistId = journalist._id;
    journalistToken = jwt.sign(
      { userId: journalist._id, email: journalist.email },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );
  });

  describe('GET /api/posts', () => {
    beforeEach(async () => {
      // Create test posts
      await Post.create([
        {
          title: 'Test Article 1',
          content: 'This is test content 1',
          type: 'article',
          author: journalistId,
          status: 'published'
        },
        {
          title: 'Test Article 2',
          content: 'This is test content 2',
          type: 'article',
          author: journalistId,
          status: 'published'
        },
        {
          title: 'Draft Article',
          content: 'This is a draft',
          type: 'article',
          author: journalistId,
          status: 'draft'
        }
      ]);
    });

    it('should get all published posts', async () => {
      const response = await request(app)
        .get('/api/posts')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.posts).toHaveLength(2); // Only published posts
      expect(response.body.data.total).toBe(2);
    });

    it('should paginate posts correctly', async () => {
      const response = await request(app)
        .get('/api/posts?page=1&limit=1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.posts).toHaveLength(1);
      expect(response.body.data.page).toBe(1);
      expect(response.body.data.total).toBe(2);
    });

    it('should filter posts by type', async () => {
      // Create a video post
      await Post.create({
        title: 'Test Video',
        content: 'Video content',
        type: 'video',
        author: journalistId,
        status: 'published'
      });

      const response = await request(app)
        .get('/api/posts?type=video')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.posts).toHaveLength(1);
      expect(response.body.data.posts[0].type).toBe('video');
    });
  });

  describe('POST /api/posts', () => {
    it('should create a new post as journalist', async () => {
      const postData = {
        title: 'New Test Article',
        content: 'This is new content',
        type: 'article',
        status: 'draft'
      };

      const response = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${journalistToken}`)
        .send(postData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('title', postData.title);
      expect(response.body.data).toHaveProperty('author');
    });

    it('should fail to create post without authentication', async () => {
      const postData = {
        title: 'New Test Article',
        content: 'This is new content',
        type: 'article'
      };

      const response = await request(app)
        .post('/api/posts')
        .send(postData)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should fail to create post with missing required fields', async () => {
      const response = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${journalistToken}`)
        .send({
          title: 'Incomplete Post'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/posts/:id', () => {
    let postId;

    beforeEach(async () => {
      const post = await Post.create({
        title: 'Test Article',
        content: 'This is test content',
        type: 'article',
        author: journalistId,
        status: 'published'
      });
      postId = post._id;
    });

    it('should get a single post by ID', async () => {
      const response = await request(app)
        .get(`/api/posts/${postId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('title', 'Test Article');
      expect(response.body.data).toHaveProperty('author');
    });

    it('should increment views when getting a post', async () => {
      await request(app)
        .get(`/api/posts/${postId}`)
        .expect(200);

      const post = await Post.findById(postId);
      expect(post.views).toBeGreaterThan(0);
    });

    it('should return 404 for non-existent post', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const response = await request(app)
        .get(`/api/posts/${fakeId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/posts/:id', () => {
    let postId;

    beforeEach(async () => {
      const post = await Post.create({
        title: 'Original Title',
        content: 'Original content',
        type: 'article',
        author: journalistId,
        status: 'draft'
      });
      postId = post._id;
    });

    it('should update own post as journalist', async () => {
      const updateData = {
        title: 'Updated Title',
        content: 'Updated content'
      };

      const response = await request(app)
        .put(`/api/posts/${postId}`)
        .set('Authorization', `Bearer ${journalistToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('title', updateData.title);
      expect(response.body.data).toHaveProperty('content', updateData.content);
    });

    it('should fail to update post without authentication', async () => {
      const response = await request(app)
        .put(`/api/posts/${postId}`)
        .send({ title: 'Updated Title' })
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/posts/:id', () => {
    let postId;

    beforeEach(async () => {
      const post = await Post.create({
        title: 'Post to Delete',
        content: 'This will be deleted',
        type: 'article',
        author: journalistId,
        status: 'draft'
      });
      postId = post._id;
    });

    it('should delete own post as journalist', async () => {
      const response = await request(app)
        .delete(`/api/posts/${postId}`)
        .set('Authorization', `Bearer ${journalistToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify post is deleted
      const deletedPost = await Post.findById(postId);
      expect(deletedPost).toBeNull();
    });

    it('should fail to delete post without authentication', async () => {
      const response = await request(app)
        .delete(`/api/posts/${postId}`)
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/posts/:id/like', () => {
    let postId;

    beforeEach(async () => {
      const post = await Post.create({
        title: 'Test Article',
        content: 'Content',
        type: 'article',
        author: journalistId,
        status: 'published'
      });
      postId = post._id;
    });

    it('should like a post', async () => {
      const response = await request(app)
        .post(`/api/posts/${postId}/like`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify like was added
      const post = await Post.findById(postId);
      expect(post.likes).toContainEqual(userId);
    });

    it('should unlike a post when already liked', async () => {
      // Like first
      await request(app)
        .post(`/api/posts/${postId}/like`)
        .set('Authorization', `Bearer ${token}`);

      // Unlike
      const response = await request(app)
        .post(`/api/posts/${postId}/like`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify like was removed
      const post = await Post.findById(postId);
      expect(post.likes).not.toContainEqual(userId);
    });

    it('should fail to like without authentication', async () => {
      const response = await request(app)
        .post(`/api/posts/${postId}/like`)
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });
});
