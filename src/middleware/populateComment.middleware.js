/**
 * Comment Population Middleware
 *
 * Automatically populates the author field for all comment queries
 * Prevents crashes on mobile when author is not populated
 */

const Comment = require('../models/comment.model');

/**
 * Middleware to ensure comments are always returned with populated author
 *
 * This wraps the response to automatically populate author if not already populated
 */
function ensureCommentAuthorPopulated(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = async function(body) {
    if (body && body.data) {
      try {
        // Handle single comment
        if (body.data._id && body.data.author && typeof body.data.author === 'string') {
          const populated = await Comment.findById(body.data._id)
            .populate('author', 'username name avatarUrl isVerified role');

          if (populated) {
            body.data = populated.getPublicData ? populated.getPublicData(req.user?._id) : populated;
          }
        }

        // Handle array of comments
        if (Array.isArray(body.data)) {
          const unpopulatedIds = body.data
            .filter(comment => comment._id && typeof comment.author === 'string')
            .map(comment => comment._id);

          if (unpopulatedIds.length > 0) {
            const populated = await Comment.find({ _id: { $in: unpopulatedIds } })
              .populate('author', 'username name avatarUrl isVerified role');

            const populatedMap = new Map(
              populated.map(c => [c._id.toString(), c])
            );

            body.data = body.data.map(comment => {
              if (typeof comment.author === 'string') {
                const pop = populatedMap.get(comment._id.toString());
                return pop ? (pop.getPublicData ? pop.getPublicData(req.user?._id) : pop) : comment;
              }
              return comment;
            });
          }
        }
      } catch (error) {
        console.error('[Comment Population Error]:', error.message);
        // Continue with original data if population fails
      }
    }

    return originalJson(body);
  };

  next();
}

/**
 * Query middleware to auto-populate on find operations
 * Add this to comment.model.js:
 *
 * commentSchema.pre(/^find/, function(next) {
 *   if (!this.getOptions().skipAutopopulate) {
 *     this.populate('author', 'username name avatarUrl isVerified role');
 *   }
 *   next();
 * });
 */

module.exports = {
  ensureCommentAuthorPopulated
};
