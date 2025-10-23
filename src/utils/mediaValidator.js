/**
 * Utilitaire pour valider l'existence des fichiers médias
 * Utilisé pour s'assurer que les URLs de médias retournées par l'API pointent vers des fichiers existants
 */

const fs = require('fs').promises;
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, '../../public/uploads');

/**
 * Cache simple pour éviter de vérifier plusieurs fois le même fichier
 * TTL: 5 minutes
 */
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Extrait le chemin relatif d'une URL d'upload
 */
function extractUploadPath(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  // Patterns possibles:
  // - /uploads/profile/file.jpg
  // - http://localhost:3000/uploads/profile/file.jpg
  // - uploads/profile/file.jpg
  const match = url.match(/(?:\/|^)uploads\/(.+)/);
  return match ? match[1] : null;
}

/**
 * Vérifie si un fichier existe (avec cache)
 */
async function fileExists(filePath) {
  // Vérifier le cache
  const cached = cache.get(filePath);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.exists;
  }

  // Vérifier sur le disque
  try {
    await fs.access(filePath, fs.constants.F_OK);
    cache.set(filePath, { exists: true, timestamp: Date.now() });
    return true;
  } catch {
    cache.set(filePath, { exists: false, timestamp: Date.now() });
    return false;
  }
}

/**
 * Valide une URL de média et retourne null si le fichier n'existe pas
 */
async function validateMediaUrl(url) {
  if (!url) {
    return null;
  }

  // Les chemins par défaut sont toujours valides
  if (url.includes('/assets/images/defaults/')) {
    return url;
  }

  const relativePath = extractUploadPath(url);
  if (!relativePath) {
    return url;
  } // URL externe ou invalide, on laisse passer

  const fullPath = path.join(UPLOADS_DIR, relativePath);
  const exists = await fileExists(fullPath);

  return exists ? url : null;
}

/**
 * Valide plusieurs URLs de médias en parallèle
 */
async function validateMediaUrls(urls) {
  if (!Array.isArray(urls)) {
    return [];
  }

  const validationPromises = urls.map(url => validateMediaUrl(url));
  const results = await Promise.all(validationPromises);

  return results;
}

/**
 * Valide et nettoie un objet post/user en supprimant les médias manquants
 */
async function validateMediaFields(obj, fields = []) {
  if (!obj) {
    return obj;
  }

  const cleanedObj = { ...obj };

  for (const field of fields) {
    // Support des champs imbriqués avec dot notation
    const keys = field.split('.');
    let current = cleanedObj;
    let parent = null;
    let lastKey = null;

    // Naviguer jusqu'au dernier parent
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        break;
      }
      parent = current;
      current = current[keys[i]];
      lastKey = keys[i];
    }

    const finalKey = keys[keys.length - 1];
    const value = current?.[finalKey];

    if (value) {
      const validatedUrl = await validateMediaUrl(value);
      if (validatedUrl === null) {
        // Média manquant, on le supprime
        if (parent && lastKey) {
          parent[lastKey][finalKey] = null;
        } else {
          current[finalKey] = null;
        }
      }
    }
  }

  return cleanedObj;
}

/**
 * Nettoie le cache (appelé périodiquement)
 */
function clearCache() {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      cache.delete(key);
    }
  }
}

// Nettoyage du cache toutes les 5 minutes
setInterval(clearCache, CACHE_TTL);

module.exports = {
  validateMediaUrl,
  validateMediaUrls,
  validateMediaFields,
  extractUploadPath,
  clearCache
};
