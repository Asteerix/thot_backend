/* eslint-disable */
const User = require('../models/user.model');
const { generateToken, verifyToken } = require('../middleware/auth.middleware');

// Helper function to get base URL from request
const getBaseUrl = (req) => {
  // In development, check if localhost backend is running
  // If connecting from localhost, use localhost URL, otherwise use API_BASE_URL
  const host = req.get('Host') || req.hostname;

  // If request comes from localhost, use localhost URL
  if (host && host.includes('localhost')) {
    const protocol = req.protocol || 'http';
    return `${protocol}://${host}`;
  }

  // Otherwise use API_BASE_URL from env if available
  if (process.env.API_BASE_URL) {
    return process.env.API_BASE_URL;
  }

  // Fallback to constructing from request
  const protocol = req.get('X-Forwarded-Proto') || req.protocol || 'http';
  return `${protocol}://${host}`;
};

// Helper function to convert relative URL to absolute
const toAbsoluteUrl = (req, relativeUrl) => {
  if (!relativeUrl) return relativeUrl;

  // Already absolute URL
  if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
    return relativeUrl;
  }

  // Convert relative to absolute
  const baseUrl = getBaseUrl(req);
  const path = relativeUrl.startsWith('/') ? relativeUrl : `/${relativeUrl}`;
  return `${baseUrl}${path}`;
};

// Helper function to format user profile with correct URLs
const formatUserProfile = (req, profileData, isJournalist) => {
  console.log('[formatUserProfile] Input:', {
    profileDataType: profileData.type,
    profileDataRole: profileData.role,
    isJournalistParam: isJournalist,
    hasJournalistFields: !!(profileData.organization || profileData.journalistRole)
  });

  // Convert avatar and cover URLs to absolute
  const defaultAvatar = profileData.type === 'journalist' || profileData.role === 'journalist'
    ? '/assets/images/defaults/default_journalist_avatar.png'
    : '/assets/images/defaults/default_user_avatar.png';

  const avatarUrl = profileData.avatarUrl || defaultAvatar;
  const coverUrl = profileData.coverUrl || null;

  // Don't override type and isJournalist if already correctly set in profileData
  const result = {
    ...profileData,
    avatarUrl: toAbsoluteUrl(req, avatarUrl),
    coverUrl: toAbsoluteUrl(req, coverUrl),
    // Preserve the type from profileData if it exists, otherwise use isJournalist param
    type: profileData.type || (isJournalist ? 'journalist' : 'regular'),
    // Preserve isJournalist from profileData if it exists, otherwise use param
    isJournalist: profileData.isJournalist !== undefined ? profileData.isJournalist : isJournalist
  };
  
  // Only add stats if not already present (for backward compatibility)
  if (!profileData.stats) {
    result.stats = {
      postes: isJournalist ? 0 : 0,
      followers: isJournalist ? 0 : 0,
      following: 0
    };
  }
  
  console.log('[formatUserProfile] Output:', {
    resultType: result.type,
    resultIsJournalist: result.isJournalist,
    resultRole: result.role,
    organization: result.organization,
    journalistRole: result.journalistRole
  });
  
  return result;
};

exports.register = async (req, res) => {
  console.log('[AUTH] Register attempt:', {
    email: req.body.email,
    isJournalist: req.body.isJournalist,
    pressCard: req.body.pressCard,
    organization: req.body.organization,
    timestamp: new Date().toISOString()
  });

  try {
    const { email, password, name, firstName, lastName, username, isJournalist, organization, pressCard, ...otherData } = req.body;

    // Validate email - Allow Unicode characters in local part
    if (!email || !email.match(/^[^\s@]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/)) {
      console.log('[AUTH] Registration failed: Invalid email format:', email);
      return res.status(400).json({
        success: false,
        message: 'Format d\'email invalide'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      console.log('[AUTH] Registration failed: Email already exists:', email);
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Validate password
    if (!password || password.length < 8 ||
        !password.match(/[A-Z]/) ||
        !password.match(/[a-z]/) ||
        !password.match(/[0-9]/) ||
        !password.match(/[!@#$%^&*(),.?":{}|<>]/)) {
      console.log('[AUTH] Registration failed: Invalid password format');
      return res.status(400).json({
        success: false,
        message: 'Le mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule, un chiffre et un caractère spécial'
      });
    }

    let user;

    if (isJournalist) {
      // Validate journalist specific fields - pressCard is now optional
      if (pressCard && !pressCard.match(/^\d{4,}$/)) {
        console.log('[AUTH] Registration failed: Invalid press card format:', pressCard);
        return res.status(400).json({
          success: false,
          message: 'Le numéro de carte de presse doit contenir au moins 4 chiffres'
        });
      }

      // Create new journalist in User model with journalist role
      user = new User({
        email,
        password,
        name: name || `${firstName} ${lastName}`,
        // Pas de username pour les journalistes
        role: 'journalist',
        organization: organization || 'indépendant',
        pressCard,
        isVerified: !!pressCard, // Auto-verify if press card is provided
        ...otherData
      });
    } else {
      // Validate username for regular users
      if (!username || !username.match(/^[a-zA-Z0-9_]+$/)) {
        console.log('[AUTH] Registration failed: Invalid username format:', username);
        return res.status(400).json({
          success: false,
          message: 'Username can only contain letters, numbers and underscores'
        });
      }

      // Create new regular user
      user = new User({
        email,
        password,
        username,
        name: name || username, // Use name if provided, otherwise use username
        ...otherData
      });
    }

    await user.save();
    
    // If journalist with press card, log verification
    if (isJournalist && pressCard) {
      console.log('[AUTH] Auto-verified journalist with press card:', {
        userId: user._id,
        email: user.email,
        pressCard: pressCard,
        isVerified: true
      });
    }

    // Generate token
    const token = generateToken(user._id);

    console.log('[AUTH] Registration successful:', {
      userId: user._id,
      email: user.email,
      isJournalist,
      timestamp: new Date().toISOString()
    });

    const profileData = user.getPublicProfile();
    console.log('[AUTH] User profile data:', profileData);

    res.status(201).json({
      success: true,
      data: {
        token,
        user: formatUserProfile(req, profileData, isJournalist)
      }
    });
  } catch (error) {
    console.error('[AUTH] Registration error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(400).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
};

exports.login = async (req, res) => {
  console.log('[AUTH] Login attempt:', {
    email: req.body.email,
    timestamp: new Date().toISOString()
  });

  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    const isJournalist = user?.role === 'journalist';

    if (!user) {
      console.log('[AUTH] Login failed: User not found:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        code: 'USER_NOT_FOUND'
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      console.log('[AUTH] Login failed: Invalid password for:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        code: 'INVALID_PASSWORD'
      });
    }

    // Check if account is suspended
    if (user.status === 'suspended') {
      // Check if temporary suspension has expired
      if (user.suspendedUntil && new Date() > new Date(user.suspendedUntil)) {
        console.log('[AUTH] Temporary suspension expired, lifting suspension:', email);
        // Lift the suspension
        user.status = 'active';
        user.suspensionReason = null;
        user.suspendedAt = null;
        user.suspendedUntil = null;
        user.suspendedBy = null;
        await user.save();
      } else {
        // Suspension is still active
        console.log('[AUTH] Login failed: Account suspended:', email);
        return res.status(403).json({
          success: false,
          message: 'Account is suspended',
          code: 'ACCOUNT_SUSPENDED',
          details: {
            status: 'suspended',
            suspensionReason: user.suspensionReason || 'No reason provided',
            suspendedAt: user.suspendedAt,
            suspendedUntil: user.suspendedUntil,
            // Calculate if suspension is temporary or permanent
            isPermanent: !user.suspendedUntil,
            // If temporary, include remaining time
            remainingTime: user.suspendedUntil ? 
              Math.max(0, new Date(user.suspendedUntil) - new Date()) : null
          }
        });
      }
    }

    // Check if account is banned
    if (user.status === 'banned') {
      console.log('[AUTH] Login failed: Account banned:', email);
      return res.status(403).json({
        success: false,
        message: 'Account is permanently banned',
        code: 'ACCOUNT_BANNED',
        details: {
          status: 'banned',
          banReason: user.banReason || 'No reason provided',
          bannedAt: user.bannedAt,
          isPermanent: true
        }
      });
    }

    // Check if account is inactive
    if (user.status === 'inactive') {
      console.log('[AUTH] Login failed: Account inactive:', email);
      return res.status(403).json({
        success: false,
        message: 'Account is inactive',
        code: 'ACCOUNT_INACTIVE',
        details: {
          status: 'inactive',
          message: 'Please contact support to reactivate your account'
        }
      });
    }

    // Generate token
    const token = generateToken(user._id);

    // Update last active
    await user.updateLastActive();

    console.log('[AUTH] Login successful:', {
      userId: user._id,
      email: user.email,
      isJournalist,
      timestamp: new Date().toISOString()
    });

    const profileData = user.getPublicProfile();
    console.log('[AUTH] Login profile data:', profileData);

    res.json({
      success: true,
      data: {
        token,
        user: formatUserProfile(req, profileData, isJournalist)
      }
    });
  } catch (error) {
    console.error('[AUTH] Login error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(400).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

exports.refreshToken = async (req, res) => {
  console.log('[AUTH] Token refresh attempt:', {
    timestamp: new Date().toISOString()
  });

  try {
    const { token: oldToken } = req.body;
    const decoded = verifyToken(oldToken);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    // Try to find user in both collections
    let _user = await User.findById(decoded.id);
    let isJournalist = false;

    if (!user) {
      const user = await Journalist.findById(decoded.id);
      isJournalist = true;
    }

    if (!user) {
      throw new Error('User not found');
    }

    // Generate new token
    const token = generateToken(user._id);

    console.log('[AUTH] Token refreshed successfully:', {
      userId: user._id,
      isJournalist,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: { token }
    });
  } catch (error) {
    console.error('[AUTH] Token refresh error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(401).json({
      success: false,
      message: 'Token refresh failed',
      error: error.message
    });
  }
};

exports.getProfile = async (req, res) => {
  console.log('[AUTH] Get profile:', {
    userId: req.user._id,
    userRole: req.user.role,
    isJournalist: req.isJournalist,
    userModelName: req.user.constructor.modelName,
    timestamp: new Date().toISOString()
  });

  try {
    // Get the raw user object for detailed logging
    const userObject = req.user;
    
    // Detailed log of raw user object data
    console.log('[AUTH] Raw user object data:', {
      _id: userObject._id,
      role: userObject.role,
      journalistRole: userObject.journalistRole,
      organization: userObject.organization,
      pressCard: userObject.pressCard,
      isVerified: userObject.isVerified,
      modelName: userObject.constructor.modelName,
      isJournalistFromModel: !!userObject.journalistRole || !!userObject.organization,
      allKeys: Object.keys(userObject.toObject ? userObject.toObject() : userObject)
    });
    
    const profileData = req.user.getPublicProfile();
    console.log('[AUTH] Profile data from getPublicProfile():', {
      ...profileData,
      role: profileData.role,
      type: profileData.type,
      organization: profileData.organization,
      journalistRole: profileData.journalistRole,
      isJournalist: profileData.type === 'journalist',
      hasJournalistFields: !!profileData.journalistRole || !!profileData.organization
    });

    const formattedProfile = formatUserProfile(req, profileData, req.isJournalist);
    console.log('[AUTH] Formatted profile data:', {
      ...formattedProfile,
      type: formattedProfile.type,
      isJournalist: formattedProfile.isJournalist,
      role: formattedProfile.role,
      organization: formattedProfile.organization,
      journalistRole: formattedProfile.journalistRole,
      isVerified: formattedProfile.isVerified,
      allKeys: Object.keys(formattedProfile)
    });

    const response = {
      success: true,
      data: {
        user: formattedProfile
      }
    };

    console.log('[AUTH] Get profile final response:', {
      type: response.data.user.type,
      isJournalist: response.data.user.isJournalist,
      role: response.data.user.role
    });
    res.json(response);
  } catch (error) {
    console.error('[AUTH] Get profile error:', {
      userId: req.user._id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(400).json({
      success: false,
      message: 'Failed to get profile',
      error: error.message
    });
  }
};

exports.updateProfile = async (req, res) => {
  console.log('[AUTH] Update profile attempt:', {
    userId: req.user._id,
    updates: Object.keys(req.body),
    timestamp: new Date().toISOString()
  });

  try {
    const updates = Object.keys(req.body);
    const allowedUpdates = req.isJournalist ?
      ['name', 'bio', 'avatarUrl', 'coverUrl', 'specialties', 'history', 'socialLinks', 'organization', 'location', 'journalistRole', 'pressCard', 'formations', 'experience'] :
      ['name', 'bio', 'avatarUrl', 'coverUrl', 'preferences', 'location'];

    const isValidOperation = updates.every(update =>
      allowedUpdates.includes(update));

    if (!isValidOperation) {
      console.log('[AUTH] Update profile failed: Invalid updates:', {
        userId: req.user._id,
        invalidUpdates: updates.filter(update => !allowedUpdates.includes(update))
      });

      return res.status(400).json({
        success: false,
        message: 'Invalid updates'
      });
    }

    // Validate name (minimum 2 characters, maximum 50 characters, no special characters except spaces, hyphens, and apostrophes)
    if (req.body.name) {
      const name = req.body.name.trim();
      if (name.length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Le nom doit contenir au moins 2 caractères'
        });
      }
      if (name.length > 50) {
        return res.status(400).json({
          success: false,
          message: 'Le nom ne peut pas dépasser 50 caractères'
        });
      }
      if (!/^[a-zA-ZÀ-ÿ\s'-]+$/.test(name)) {
        return res.status(400).json({
          success: false,
          message: 'Le nom ne peut contenir que des lettres, espaces, tirets et apostrophes'
        });
      }
      req.body.name = name;
    }

    // Validate bio length
    if (req.body.bio && req.body.bio.trim().length > 500) {
      return res.status(400).json({
        success: false,
        message: 'La bio ne peut pas dépasser 500 caractères'
      });
    }

    // Validate location length
    if (req.body.location && req.body.location.trim().length > 100) {
      return res.status(400).json({
        success: false,
        message: 'La localisation ne peut pas dépasser 100 caractères'
      });
    }

    // Validate organization length
    if (req.body.organization && req.body.organization.trim().length > 100) {
      return res.status(400).json({
        success: false,
        message: 'L\'organisation ne peut pas dépasser 100 caractères'
      });
    }

    // Validate press card format if provided
    if (req.body.pressCard && !req.body.pressCard.match(/^\d{4,}$/)) {
      console.log('[AUTH] Update profile failed: Invalid press card format:', req.body.pressCard);
      return res.status(400).json({
        success: false,
        message: 'Le numéro de carte de presse doit contenir au moins 4 chiffres'
      });
    }

    // Validate formations array
    if (req.body.formations) {
      if (!Array.isArray(req.body.formations)) {
        return res.status(400).json({
          success: false,
          message: 'Les formations doivent être un tableau'
        });
      }
      if (req.body.formations.length > 20) {
        return res.status(400).json({
          success: false,
          message: 'Vous ne pouvez pas ajouter plus de 20 formations'
        });
      }
    }

    // Validate experiences array
    if (req.body.experience) {
      if (!Array.isArray(req.body.experience)) {
        return res.status(400).json({
          success: false,
          message: 'Les expériences doivent être un tableau'
        });
      }
      if (req.body.experience.length > 20) {
        return res.status(400).json({
          success: false,
          message: 'Vous ne pouvez pas ajouter plus de 20 expériences'
        });
      }
    }

    // Sanitize social links
    if (req.body.socialLinks) {
      if (typeof req.body.socialLinks !== 'object') {
        return res.status(400).json({
          success: false,
          message: 'Les liens sociaux doivent être un objet'
        });
      }
      // Validate URLs - allow usernames for twitter
      const urlRegex = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
      const usernameRegex = /^[\w\d_-]+$/; // Allow simple usernames

      for (const [key, value] of Object.entries(req.body.socialLinks)) {
        if (value && typeof value === 'string' && value.trim() !== '') {
          // Twitter can be just a username
          if (key === 'twitter') {
            if (!usernameRegex.test(value) && !urlRegex.test(value)) {
              return res.status(400).json({
                success: false,
                message: `Le lien ${key} n'est pas valide (nom d'utilisateur ou URL)`
              });
            }
          } else {
            // Other social links must be URLs
            if (!urlRegex.test(value)) {
              return res.status(400).json({
                success: false,
                message: `Le lien ${key} n'est pas une URL valide`
              });
            }
          }
        }
      }
    }

    updates.forEach(update => {
      req.user[update] = req.body[update];
    });

    // Auto-verify journalist if press card is provided
    if (req.isJournalist && req.body.pressCard && !req.user.isVerified) {
      req.user.isVerified = true;
      console.log('[AUTH] Auto-verified journalist with press card:', {
        userId: req.user._id,
        email: req.user.email,
        pressCard: req.body.pressCard,
        isVerified: true
      });
    }

    await req.user.save();

    console.log('[AUTH] Profile updated successfully:', {
      userId: req.user._id,
      updates,
      timestamp: new Date().toISOString()
    });

    const profileData = req.user.getPublicProfile();
    console.log('[AUTH] Updated profile data:', profileData);

    const _response = {
      success: true,
      data: {
        user: formatUserProfile(req, profileData, req.isJournalist)
      }
    };

    console.log('[AUTH] Update profile response:', _response);
    res.json(_response);
  } catch (error) {
    console.error('[AUTH] Update profile error:', {
      userId: req.user._id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(400).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    });
  }
};

exports.changePassword = async (req, res) => {
  console.log('[AUTH] Change password attempt:', {
    userId: req.user._id,
    timestamp: new Date().toISOString()
  });

  try {
    const { currentPassword, newPassword } = req.body;

    // Verify current password
    const isMatch = await req.user.comparePassword(currentPassword);
    if (!isMatch) {
      console.log('[AUTH] Change password failed: Invalid current password:', {
        userId: req.user._id
      });

      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    req.user.password = newPassword;
    await req.user.save();

    console.log('[AUTH] Password changed successfully:', {
      userId: req.user._id,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('[AUTH] Change password error:', {
      userId: req.user._id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(400).json({
      success: false,
      message: 'Failed to change password',
      error: error.message
    });
  }
};


exports.logout = async (req, res) => {
  console.log('[AUTH] Logout attempt:', {
    userId: req.user._id,
    timestamp: new Date().toISOString()
  });

  try {
    // Update last active timestamp before logout
    await req.user.updateLastActive();

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('[AUTH] Logout error:', {
      userId: req.user._id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(400).json({
      success: false,
      message: 'Logout failed',
      error: error.message
    });
  }
};

// Google Sign-In
exports.googleSignIn = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: 'Google ID token is required'
      });
    }

    // TODO: Implement Google OAuth verification
    // This would require setting up Google OAuth credentials and verifying the token
    // For now, return a not implemented response
    
    return res.status(501).json({
      success: false,
      message: 'Google Sign-In not implemented yet'
    });

  } catch (error) {
    console.error('[AUTH] Google Sign-In error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(500).json({
      success: false,
      message: 'Google Sign-In failed',
      error: error.message
    });
  }
};

// Delete Account
exports.deleteAccount = async (req, res) => {
  console.log('[AUTH] Delete account attempt:', {
    userId: req.user._id,
    username: req.user.username || req.user.name,
    email: req.user.email,
    timestamp: new Date().toISOString()
  });

  try {
    const userId = req.user._id;
    
    // Import models
    const Post = require('../models/post.model');
    const Comment = require('../models/comment.model');
    const Notification = require('../models/notification.model');
    
    // Delete all user's posts
    await Post.deleteMany({ author: userId });
    
    // Delete all user's comments
    await Comment.deleteMany({ author: userId });
    
    // Delete all user's notifications
    await Notification.deleteMany({ recipient: userId });
    
    // Remove user from followers/following lists
    await User.updateMany(
      { followers: userId },
      { $pull: { followers: userId } }
    );
    
    await User.updateMany(
      { following: userId },
      { $pull: { following: userId } }
    );
    
    // Delete the user account
    await User.findByIdAndDelete(userId);
    
    console.log('[AUTH] Account deleted successfully:', {
      userId,
      timestamp: new Date().toISOString()
    });
    
    res.json({
      success: true,
      message: 'Account deleted successfully'
    });
  } catch (error) {
    console.error('[AUTH] Delete account error:', {
      userId: req.user._id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(500).json({
      success: false,
      message: 'Failed to delete account',
      error: error.message
    });
  }
};
