/**
 * Avatar Generator - Génère des avatars personnalisés comme Facebook/Instagram
 * Crée des images uniques basées sur les initiales et l'ID de l'utilisateur
 */

const { createCanvas } = require('canvas');
const crypto = require('crypto');

/**
 * Génère un avatar personnalisé avec initiales et couleur unique
 */
function generateAvatar(userId, userName, options = {}) {
  const {
    size = 200,
    fontSize = 80,
    isJournalist = false
  } = options;

  // Créer le canvas
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Obtenir les initiales
  const initials = getInitials(userName);

  // Obtenir une couleur basée sur l'ID utilisateur
  const backgroundColor = getColorFromId(userId, isJournalist);

  // Dessiner le cercle de fond
  ctx.fillStyle = backgroundColor;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  // Dessiner les initiales
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials, size / 2, size / 2);

  // Retourner le buffer PNG
  return canvas.toBuffer('image/png');
}

/**
 * Génère une image de cover par défaut avec gradient
 */
function generateCoverImage(userId, options = {}) {
  const {
    width = 1200,
    height = 400
  } = options;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Obtenir des couleurs basées sur l'ID
  const colors = getGradientColorsFromId(userId);

  // Créer un gradient
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, colors.start);
  gradient.addColorStop(1, colors.end);

  // Dessiner le gradient
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Ajouter un pattern subtil (optionnel)
  addPattern(ctx, width, height, colors.pattern);

  return canvas.toBuffer('image/png');
}

/**
 * Génère une image de post par défaut
 */
function generatePostImage(postId, postType, options = {}) {
  const {
    width = 1080,
    height = 1080
  } = options;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Couleur de fond basée sur le type de post
  const backgroundColor = getPostTypeColor(postType);
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

  // Icône au centre
  const icon = getPostTypeIcon(postType);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.font = `${width / 4}px -apple-system`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon, width / 2, height / 2);

  return canvas.toBuffer('image/png');
}

/**
 * Extrait les initiales d'un nom (max 2 caractères)
 */
function getInitials(name) {
  if (!name || name.trim() === '') {
    return '?';
  }

  const nameParts = name.trim().split(/\s+/);

  if (nameParts.length === 1) {
    // Un seul mot: prendre les 2 premières lettres
    return nameParts[0].substring(0, 2).toUpperCase();
  }

  // Plusieurs mots: première lettre de chaque mot (max 2)
  return nameParts
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase();
}

/**
 * Génère une couleur basée sur l'ID utilisateur
 * Utilise un hash pour avoir toujours la même couleur pour le même ID
 */
function getColorFromId(userId, isJournalist = false) {
  // Palette de couleurs pour utilisateurs normaux (style Instagram/Facebook)
  const userColors = [
    '#FF6B6B', // Rouge coral
    '#4ECDC4', // Turquoise
    '#45B7D1', // Bleu ciel
    '#FFA07A', // Saumon
    '#98D8C8', // Vert menthe
    '#FF85A2', // Rose
    '#A8E6CF', // Vert pastel
    '#FFD97D', // Jaune doré
    '#B4A7D6', // Violet pastel
    '#F67280'  // Rose corail
  ];

  // Palette pour journalistes (couleurs plus professionnelles)
  const journalistColors = [
    '#2C3E50', // Bleu nuit professionnel
    '#34495E', // Gris ardoise
    '#7F8C8D', // Gris pierre
    '#16A085', // Vert émeraude
    '#2980B9', // Bleu professionnel
    '#8E44AD', // Violet profond
    '#C0392B', // Rouge bordeaux
    '#D35400', // Orange terre
    '#27AE60', // Vert forêt
    '#2C2C54'  // Bleu nuit
  ];

  const colors = isJournalist ? journalistColors : userColors;

  // Créer un hash de l'ID pour avoir un index stable
  const hash = crypto.createHash('md5').update(userId.toString()).digest('hex');
  const index = parseInt(hash.substring(0, 8), 16) % colors.length;

  return colors[index];
}

/**
 * Génère des couleurs de gradient basées sur l'ID
 */
function getGradientColorsFromId(userId) {
  const gradients = [
    { start: '#667eea', end: '#764ba2', pattern: 'rgba(255,255,255,0.1)' }, // Violet
    { start: '#f093fb', end: '#f5576c', pattern: 'rgba(255,255,255,0.1)' }, // Rose
    { start: '#4facfe', end: '#00f2fe', pattern: 'rgba(255,255,255,0.1)' }, // Bleu
    { start: '#43e97b', end: '#38f9d7', pattern: 'rgba(255,255,255,0.1)' }, // Vert
    { start: '#fa709a', end: '#fee140', pattern: 'rgba(255,255,255,0.1)' }, // Sunset
    { start: '#30cfd0', end: '#330867', pattern: 'rgba(255,255,255,0.1)' }, // Ocean
    { start: '#a8edea', end: '#fed6e3', pattern: 'rgba(255,255,255,0.1)' }, // Pastel
    { start: '#ff9a56', end: '#ff6a88', pattern: 'rgba(255,255,255,0.1)' }, // Orange
    { start: '#ffecd2', end: '#fcb69f', pattern: 'rgba(255,255,255,0.1)' }, // Peach
    { start: '#a1c4fd', end: '#c2e9fb', pattern: 'rgba(255,255,255,0.1)' }  // Sky
  ];

  const hash = crypto.createHash('md5').update(userId.toString()).digest('hex');
  const index = parseInt(hash.substring(0, 8), 16) % gradients.length;

  return gradients[index];
}

/**
 * Obtient la couleur de fond pour un type de post
 */
function getPostTypeColor(postType) {
  const colors = {
    article: '#3498db',    // Bleu pour articles
    video: '#e74c3c',      // Rouge pour vidéos
    short: '#f39c12',      // Orange pour shorts
    question: '#9b59b6',   // Violet pour questions
    podcast: '#1abc9c',    // Vert pour podcasts
    default: '#95a5a6'     // Gris par défaut
  };

  return colors[postType] || colors.default;
}

/**
 * Obtient l'icône emoji pour un type de post
 */
function getPostTypeIcon(postType) {
  const icons = {
    article: '📰',
    video: '🎥',
    short: '⚡',
    question: '❓',
    podcast: '🎙️',
    default: '📄'
  };

  return icons[postType] || icons.default;
}

/**
 * Ajoute un pattern subtil à l'image
 */
function addPattern(ctx, width, height, color) {
  ctx.fillStyle = color;

  // Dessiner des cercles subtils
  for (let i = 0; i < 5; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const radius = Math.random() * 100 + 50;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Génère une image transparente 1x1 (pour les covers manquantes)
 */
function generateTransparentImage() {
  const canvas = createCanvas(1, 1);
  const ctx = canvas.getContext('2d');

  // Laisser le canvas transparent
  ctx.clearRect(0, 0, 1, 1);

  return canvas.toBuffer('image/png');
}

module.exports = {
  generateAvatar,
  generateCoverImage,
  generatePostImage,
  generateTransparentImage,
  getInitials,
  getColorFromId
};
