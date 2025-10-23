const User = require('../models/user.model');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

class AuthService {
  /**
   * Find user by ID (can be regular user or journalist)
   */
  static async findUserById(userId) {
    try {
      const user = await User.findById(userId).select('-password');
      if (user) {
        return { user, userType: user.role === 'journalist' ? 'journalist' : 'user' };
      }
      return null;
    } catch (error) {
      console.error('Error finding user by ID:', error);
      throw error;
    }
  }

  /**
   * Find user by email (can be regular user or journalist)
   */
  static async findUserByEmail(email) {
    try {
      const user = await User.findOne({ email });
      if (user) {
        return { user, userType: user.role === 'journalist' ? 'journalist' : 'user' };
      }
      return null;
    } catch (error) {
      console.error('Error finding user by email:', error);
      throw error;
    }
  }

  /**
   * Find user by username (can be regular user or journalist)
   */
  static async findUserByUsername(username) {
    try {
      const user = await User.findOne({ username });
      if (user) {
        return { user, userType: user.role === 'journalist' ? 'journalist' : 'user' };
      }
      return null;
    } catch (error) {
      console.error('Error finding user by username:', error);
      throw error;
    }
  }

  /**
   * Verify user password
   */
  static async verifyPassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  /**
   * Hash password
   */
  static async hashPassword(password) {
    return bcrypt.hash(password, 10);
  }

  /**
   * Generate JWT token
   */
  static generateToken(userId, userType = 'user') {
    return jwt.sign(
      { userId, userType },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
  }

  /**
   * Verify JWT token
   */
  static verifyToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return null;
    }
  }

  /**
   * Create new user
   */
  static async createUser(userData) {
    try {
      const hashedPassword = await this.hashPassword(userData.password);
      const user = new User({
        ...userData,
        password: hashedPassword
      });
      await user.save();

      // Remove password from response
      const userObject = user.toObject();
      delete userObject.password;

      return userObject;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  /**
   * Create new journalist
   */
  static async createJournalist(journalistData) {
    try {
      const hashedPassword = await this.hashPassword(journalistData.password);
      const journalist = new User({
        ...journalistData,
        password: hashedPassword,
        role: 'journalist'
      });
      await journalist.save();

      // Remove password from response
      const journalistObject = journalist.toObject();
      delete journalistObject.password;

      return journalistObject;
    } catch (error) {
      console.error('Error creating journalist:', error);
      throw error;
    }
  }

  /**
   * Update user last login
   */
  static async updateLastLogin(userId, _userType) {
    try {
      await User.findByIdAndUpdate(userId, { lastLogin: new Date() });
    } catch (error) {
      console.error('Error updating last login:', error);
      // Non-critical error, don't throw
    }
  }

  /**
   * Check if user exists
   */
  static async userExists(email, username) {
    try {
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        return { exists: true, field: 'email' };
      }

      const usernameExists = await User.findOne({ username });
      if (usernameExists) {
        return { exists: true, field: 'username' };
      }

      return { exists: false };
    } catch (error) {
      console.error('Error checking user existence:', error);
      throw error;
    }
  }

  /**
   * Update user password
   */
  static async updatePassword(userId, _userType, newPassword) {
    try {
      const hashedPassword = await this.hashPassword(newPassword);

      await User.findByIdAndUpdate(userId, {
        password: hashedPassword,
        passwordChangedAt: new Date()
      });

      return true;
    } catch (error) {
      console.error('Error updating password:', error);
      throw error;
    }
  }

  /**
   * Delete user account
   */
  static async deleteAccount(userId, _userType) {
    try {
      await User.findByIdAndDelete(userId);
      return true;
    } catch (error) {
      console.error('Error deleting account:', error);
      throw error;
    }
  }
}

module.exports = AuthService;