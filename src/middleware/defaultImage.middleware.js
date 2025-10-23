/**
 * Middleware to serve default images for missing uploads
 * Generates personalized avatars like Facebook/Instagram
 */

const path = require('path');
const fs = require('fs');
const {
  generateAvatar,
  generateCoverImage,
  generatePostImage,
  generateTransparentImage
} = require('../utils/avatarGenerator');

// Generate a simple 1x1 transparent PNG in base64
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

/**
 * Middleware that catches 404 errors for uploads and returns a default image
 * Generates personalized images dynamically based on user data
 * This middleware should be placed AFTER express.static
 */
const defaultImageMiddleware = async (req, res, next) => {
  // Only apply to /uploads routes that are image requests
  if (!req.path.startsWith('/uploads') || !isImageRequest(req.path)) {
    return next();
  }

  // Check if the file exists in the correct uploads directory
  const uploadsDir = path.join(__dirname, '../../uploads');
  const requestedPath = req.path.replace('/uploads/', '');
  const fullPath = path.join(uploadsDir, requestedPath);

  console.log('[DEFAULT IMAGE] Checking file:', {
    requestedPath,
    fullPath,
    exists: fileExistsSync(fullPath)
  });

  if (!fileExistsSync(fullPath)) {
    // File doesn't exist, generate default based on path and user
    console.log('[DEFAULT IMAGE] File not found, generating default');
    return await sendDefaultImageForType(req, res, requestedPath);
  }

  // File exists, but express.static should have served it
  // This means we're in a fallback situation
  next();
};

/**
 * Check if the request is for an image file
 */
function isImageRequest(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext);
}

/**
 * Send a default image based on the type of upload
 * Generates personalized images dynamically
 */
async function sendDefaultImageForType(req, res, requestedPath) {
  try {
    // Extraire les informations de l'utilisateur ou du post
    const userInfo = await getUserInfoFromRequest(req, requestedPath);

    let imageBuffer;
    let cacheMaxAge = 86400; // 24h par défaut

    if (requestedPath.includes('/profile/')) {
      // Générer un avatar personnalisé avec initiales
      console.log('[DEFAULT IMAGE] Generating personalized avatar for:', userInfo.name);
      imageBuffer = generateAvatar(
        userInfo.userId,
        userInfo.name,
        { isJournalist: userInfo.isJournalist, size: 200 }
      );
      cacheMaxAge = 604800; // Cache 7 jours pour avatars
    } else if (requestedPath.includes('/cover/')) {
      // Générer une cover avec gradient unique
      console.log('[DEFAULT IMAGE] Generating cover for user:', userInfo.userId);
      imageBuffer = generateCoverImage(userInfo.userId, { width: 1200, height: 400 });
      cacheMaxAge = 604800; // Cache 7 jours
    } else if (requestedPath.includes('/article/') || requestedPath.includes('/question/') ||
               requestedPath.includes('/video/') || requestedPath.includes('/short/') ||
               requestedPath.includes('/podcast/')) {
      // Générer image de post basée sur le type
      const postType = getPostTypeFromPath(requestedPath);
      console.log('[DEFAULT IMAGE] Generating post image for type:', postType);
      imageBuffer = generatePostImage(userInfo.postId, postType, { width: 1080, height: 1080 });
      cacheMaxAge = 3600; // Cache 1h pour posts
    } else {
      // Cas par défaut: image transparente
      console.log('[DEFAULT IMAGE] Generating transparent image');
      imageBuffer = generateTransparentImage();
      cacheMaxAge = 300; // Cache 5 min
    }

    // Envoyer l'image générée
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', `public, max-age=${cacheMaxAge}`);
    res.setHeader('X-Default-Image', 'generated');
    res.setHeader('X-Generated-For', userInfo.name || 'unknown');
    return res.status(200).send(imageBuffer);

  } catch (error) {
    console.error('[DEFAULT IMAGE] Error generating image:', error);
    // Fallback: image transparente
    return sendTransparentImage(res);
  }
}

/**
 * Serve an image file directly
 */
function _serveImageFile(res, filePath) {
  try {
    const imageBuffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();

    // Déterminer le type MIME
    const mimeTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml'
    };

    const contentType = mimeTypes[ext] || 'image/png';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache 24h
    res.setHeader('X-Default-Image', 'true');
    return res.status(200).send(imageBuffer);
  } catch (err) {
    console.error('[DEFAULT IMAGE] Error serving file:', err.message);
    return sendTransparentImage(res);
  }
}

/**
 * Send a default transparent image
 */
function sendTransparentImage(res) {
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
  res.setHeader('X-Default-Image', 'true');
  return res.status(200).send(TRANSPARENT_PNG);
}

/**
 * Version synchrone pour vérifier rapidement l'existence d'un fichier
 */
function fileExistsSync(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Récupère les informations de l'utilisateur à partir de la requête
 */
async function getUserInfoFromRequest(req, requestedPath) {
  // Par défaut
  let userInfo = {
    userId: 'anonymous',
    name: 'User',
    isJournalist: false,
    postId: 'default'
  };

  try {
    // Si l'utilisateur est authentifié, utiliser ses informations
    if (req.user && req.user.userId) {
      const User = require('../models/user.model');
      const user = await User.findById(req.user.userId).select('name role').lean();

      if (user) {
        userInfo = {
          userId: req.user.userId.toString(),
          name: user.name || 'User',
          isJournalist: user.role === 'journalist',
          postId: 'default'
        };
      }
    } else {
      // Essayer d'extraire l'ID du chemin du fichier
      // Format: /uploads/profile/1759420652001-877536695.jpg
      const match = requestedPath.match(/(\d+)-(\d+)\./);
      if (match) {
        userInfo.userId = match[1]; // Timestamp comme ID
        userInfo.postId = match[1];
      }
    }
  } catch (error) {
    console.error('[DEFAULT IMAGE] Error getting user info:', error.message);
  }

  return userInfo;
}

/**
 * Détermine le type de post à partir du chemin
 */
function getPostTypeFromPath(requestedPath) {
  if (requestedPath.includes('/article/')) {
    return 'article';
  }
  if (requestedPath.includes('/video/')) {
    return 'video';
  }
  if (requestedPath.includes('/short/')) {
    return 'short';
  }
  if (requestedPath.includes('/question/')) {
    return 'question';
  }
  if (requestedPath.includes('/podcast/')) {
    return 'podcast';
  }
  return 'default';
}

module.exports = {
  defaultImageMiddleware,
  fileExistsSync
};
