const socketio = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
// const _NotificationService = require('./notificationService'); // Currently unused

class SocketService {
  constructor() {
    this.io = null;
    this.users = new Map(); // userId -> socketId mapping
    this.sockets = new Map(); // socketId -> userId mapping
  }

  initialize(server) {
    this.io = socketio(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000
    });

    this.setupMiddleware();
    this.setupEventHandlers();

    console.log('Socket.IO service initialized');
    return this.io;
  }

  setupMiddleware() {
    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization;

        if (!token) {
          console.log('[Socket.IO] No token provided, allowing connection without auth');
          // Allow connection without authentication for now
          socket.userId = 'anonymous';
          socket.user = { _id: 'anonymous', username: 'anonymous', role: 'user' };
          return next();
        }

        const tokenStr = token.replace('Bearer ', '');
        const decoded = jwt.verify(tokenStr, process.env.JWT_SECRET || 'test-secret');

        // Support both 'id' and 'userId' in token
        const userId = decoded.id || decoded.userId;

        if (!userId) {
          console.log('[Socket.IO] Token has no user ID:', decoded);
          socket.userId = 'anonymous';
          socket.user = { _id: 'anonymous', username: 'anonymous', role: 'user' };
          return next();
        }

        // Try to find user in database
        let user;
        try {
          user = await User.findById(userId).select('_id username name role');
        } catch (err) {
          console.log('[Socket.IO] Database error, using mock user:', err.message);
        }

        if (!user) {
          console.log(`[Socket.IO] User not found for ID: ${userId}, creating mock user`);
          user = {
            _id: userId,
            username: `user_${userId}`,
            role: 'user'
          };
        }

        socket.userId = user._id?.toString ? user._id.toString() : user._id;
        socket.user = user;
        next();
      } catch (err) {
        console.error('[Socket.IO] Authentication error:', err.message);
        // Allow connection even if auth fails
        socket.userId = 'anonymous';
        socket.user = { _id: 'anonymous', username: 'anonymous', role: 'user' };
        next();
      }
    });
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`User ${socket.userId} connected via socket ${socket.id}`);

      // Store socket mapping
      this.users.set(socket.userId, socket.id);
      this.sockets.set(socket.id, socket.userId);

      // Join user's personal room
      socket.join(`user:${socket.userId}`);

      // Emit connection success
      socket.emit('connected', {
        userId: socket.userId,
        socketId: socket.id
      });

      // Handle subscription to notification updates
      socket.on('subscribe:notifications', () => {
        socket.join(`notifications:${socket.userId}`);
        console.log(`User ${socket.userId} subscribed to notifications`);
      });

      // Handle subscription to post updates
      socket.on('subscribe:post', (postId) => {
        socket.join(`post:${postId}`);
        console.log(`User ${socket.userId} subscribed to post ${postId}`);
      });

      // Handle unsubscription from post updates
      socket.on('unsubscribe:post', (postId) => {
        socket.leave(`post:${postId}`);
        console.log(`User ${socket.userId} unsubscribed from post ${postId}`);
      });

      // Handle subscription to user updates (for following)
      socket.on('subscribe:user', (userId) => {
        socket.join(`user:${userId}:followers`);
        console.log(`User ${socket.userId} subscribed to user ${userId} updates`);
      });

      // Handle typing indicators
      socket.on('typing:start', (data) => {
        socket.to(`post:${data.postId}`).emit('user:typing', {
          userId: socket.userId,
          username: socket.user.username,
          postId: data.postId
        });
      });

      socket.on('typing:stop', (data) => {
        socket.to(`post:${data.postId}`).emit('user:stopped_typing', {
          userId: socket.userId,
          postId: data.postId
        });
      });

      // Handle real-time message/comment
      socket.on('comment:send', async (data) => {
        // Emit to all subscribed users
        this.io.to(`post:${data.postId}`).emit('comment:new', {
          ...data,
          userId: socket.userId,
          username: socket.user.username,
          timestamp: new Date()
        });
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`User ${socket.userId} disconnected`);
        this.users.delete(socket.userId);
        this.sockets.delete(socket.id);
      });

      // Handle errors
      socket.on('error', (error) => {
        console.error(`Socket error for user ${socket.userId}:`, error);
      });
    });
  }

  // Send notification to specific user
  async sendNotification(userId, notification) {
    try {
      const socketId = this.users.get(userId.toString());
      if (socketId) {
        this.io.to(socketId).emit('notification:new', notification);
        console.log(`Notification sent to user ${userId} via socket`);
      } else {
        console.log(`User ${userId} not connected, notification will be fetched later`);
      }
    } catch (error) {
      console.error('Error sending notification via socket:', error);
    }
  }

  // Broadcast to all users in a room
  broadcastToRoom(room, event, data) {
    this.io.to(room).emit(event, data);
  }

  // Send to specific user
  sendToUser(userId, event, data) {
    const socketId = this.users.get(userId.toString());
    if (socketId) {
      this.io.to(socketId).emit(event, data);
    }
  }

  // Notify followers of new post
  notifyFollowers(authorId, postData) {
    this.io.to(`user:${authorId}:followers`).emit('post:new', postData);
  }

  // Notify post subscribers of update
  notifyPostUpdate(postId, updateData) {
    this.io.to(`post:${postId}`).emit('post:updated', updateData);
  }

  // Notify when someone likes a post
  notifyLike(postId, likeData) {
    this.io.to(`post:${postId}`).emit('post:liked', likeData);
  }

  // Notify when someone comments
  notifyComment(postId, commentData) {
    this.io.to(`post:${postId}`).emit('comment:new', commentData);
  }

  // Get online users count
  getOnlineUsersCount() {
    return this.users.size;
  }

  // Check if user is online
  isUserOnline(userId) {
    return this.users.has(userId.toString());
  }

  // Get all online users
  getOnlineUsers() {
    return Array.from(this.users.keys());
  }
}

// Create singleton instance
const socketService = new SocketService();

module.exports = socketService;
