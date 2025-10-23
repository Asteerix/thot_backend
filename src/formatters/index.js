// Central export for all formatters
const { formatPost, formatPosts, formatInteractions, formatPoliticalOrientation } = require('./post.formatter');
const { formatUser, formatUsers, formatPublicUser } = require('./user.formatter');
const { formatComment, formatComments } = require('./comment.formatter');

module.exports = {
  // Post formatters
  formatPost,
  formatPosts,
  formatInteractions,
  formatPoliticalOrientation,

  // User formatters
  formatUser,
  formatUsers,
  formatPublicUser,
  formatJournalist: formatUser, // Alias: journalists are users with role='journalist'

  // Comment formatters
  formatComment,
  formatComments
};