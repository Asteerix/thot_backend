// URL Helper to generate dynamic URLs based on request origin

const path = require('path');
const fs = require('fs');

const getBaseUrl = (req) => {
  // Priority order:
  // 1. If request comes from localhost, use localhost URL
  // 2. API_BASE_URL from environment (for development with ngrok/VPS)
  // 3. X-Forwarded headers (for proxies)
  // 4. Direct request URL

  const host = req.get('Host') || req.hostname;

  // If request comes from localhost, always use localhost URL
  if (host && host.includes('localhost')) {
    const protocol = req.protocol || 'http';
    return `${protocol}://${host}`;
  }

  // Use API_BASE_URL from env if available
  if (process.env.API_BASE_URL && process.env.NODE_ENV === 'development') {
    return process.env.API_BASE_URL;
  }

  // Get protocol
  const protocol = req.get('X-Forwarded-Proto') || req.protocol || 'http';

  // Build base URL
  return `${protocol}://${host}`;
};

const buildUrl = (req, path) => {
  const baseUrl = getBaseUrl(req);
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
};

const buildMediaUrl = (req, filePath, defaultPath = null) => {
  if (!filePath) {
    // Return default path if provided
    if (defaultPath) {
      return buildUrl(req, defaultPath);
    }
    return null;
  }

  // If already a full URL, return as is
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return filePath;
  }

  // Build URL for local file
  return buildUrl(req, filePath);
};

/**
 * Vérifie si un fichier existe physiquement
 */
const fileExists = (filePath) => {
  try {
    const uploadsDir = path.join(__dirname, '../../uploads');
    // Remove leading slash and /uploads prefix
    const cleanPath = filePath.replace(/^\//, '').replace(/^uploads\//, '');
    const fullPath = path.join(uploadsDir, cleanPath);
    return fs.existsSync(fullPath);
  } catch {
    return false;
  }
};

/**
 * Construit une URL média en vérifiant l'existence du fichier
 * Si le fichier n'existe pas, retourne l'URL par défaut appropriée
 */
const buildMediaUrlSafe = (req, filePath, options = {}) => {
  const { defaultPath = null, type = 'generic' } = options;

  // Si pas de filePath, retourner le défaut
  if (!filePath) {
    if (defaultPath) {
      return buildUrl(req, defaultPath);
    }
    return getDefaultImagePath(type);
  }

  // Si URL absolue, la retourner telle quelle
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return filePath;
  }

  // Vérifier si le fichier existe
  if (!fileExists(filePath)) {
    console.log(`[URL HELPER] File not found: ${filePath}, using default for type: ${type}`);
    const defaultImagePath = getDefaultImagePath(type);
    if (defaultImagePath) {
      return buildUrl(req, defaultImagePath);
    }
  }

  // Le fichier existe, construire l'URL
  return buildUrl(req, filePath);
};

/**
 * Retourne le chemin de l'image par défaut selon le type
 */
const getDefaultImagePath = (type) => {
  switch (type) {
  case 'profile':
  case 'user':
    return '/assets/images/defaults/default_user_avatar.png';
  case 'journalist':
    return '/assets/images/defaults/default_journalist_avatar.png';
  case 'cover':
    return null; // Pas de cover par défaut
  case 'post':
    return '/assets/images/defaults/default-post-image.png';
  default:
    return null;
  }
};

module.exports = {
  getBaseUrl,
  buildUrl,
  buildMediaUrl,
  buildMediaUrlSafe,
  fileExists,
  getDefaultImagePath
};
