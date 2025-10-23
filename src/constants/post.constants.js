/**
 * Post-related constants
 */

// Political orientation colors and mappings
const POLITICAL_ORIENTATION = {
  EXTREMELY_CONSERVATIVE: 'extremely_conservative',
  CONSERVATIVE: 'conservative',
  NEUTRAL: 'neutral',
  PROGRESSIVE: 'progressive',
  EXTREMELY_PROGRESSIVE: 'extremely_progressive'
};

const POLITICAL_VIEW_COLORS = {
  [POLITICAL_ORIENTATION.EXTREMELY_CONSERVATIVE]: '#FF0000', // Red
  [POLITICAL_ORIENTATION.CONSERVATIVE]: '#FF6B6B', // Light red
  [POLITICAL_ORIENTATION.NEUTRAL]: '#808080', // Gray
  [POLITICAL_ORIENTATION.PROGRESSIVE]: '#6B8EFF', // Light blue
  [POLITICAL_ORIENTATION.EXTREMELY_PROGRESSIVE]: '#0000FF' // Blue
};

// Mapping between numeric scores and orientation labels
const SCORE_TO_ORIENTATION = {
  '-2': POLITICAL_ORIENTATION.EXTREMELY_CONSERVATIVE,
  '-1': POLITICAL_ORIENTATION.CONSERVATIVE,
  '0': POLITICAL_ORIENTATION.NEUTRAL,
  '1': POLITICAL_ORIENTATION.PROGRESSIVE,
  '2': POLITICAL_ORIENTATION.EXTREMELY_PROGRESSIVE
};

// Post types
const POST_TYPES = {
  ARTICLE: 'article',
  VIDEO: 'video',
  SHORT: 'short',
  QUESTION: 'question'
};

// Post statuses
const POST_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  DELETED: 'deleted'
};

// Interaction types
const INTERACTION_TYPES = {
  LIKE: 'like',
  DISLIKE: 'dislike',
  BOOKMARK: 'bookmark',
  COMMENT: 'comment',
  POLITICAL_VIEW: 'political-view',
  VOTE_ORIENTATION: 'vote_orientation'
};

// Default values
const DEFAULTS = {
  POST_IMAGE: '/uploads/default-post-image.png',
  PAGE: 1,
  LIMIT: 20
};

// Pagination limits
const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100
};

module.exports = {
  POLITICAL_ORIENTATION,
  POLITICAL_VIEW_COLORS,
  SCORE_TO_ORIENTATION,
  POST_TYPES,
  POST_STATUS,
  INTERACTION_TYPES,
  DEFAULTS,
  PAGINATION
};