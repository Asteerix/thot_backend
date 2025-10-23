const { formatUser } = require('./user.formatter');

/**
 * Format comment with proper structure for mobile
 */
const formatComment = (comment, req, currentUser = null) => {
  if (!comment) {
    return null;
  }

  const commentObj = comment.toObject ? comment.toObject() : { ...comment };
  const currentUserId = currentUser?._id;

  // Format author (user or journalist)
  if (commentObj.author) {
    commentObj.author = formatUser(commentObj.author, req, currentUser);
  }

  // Calculate likes count and check if current user liked
  const likesCount = commentObj.likes?.length || 0;
  const isLiked = currentUserId ? commentObj.likes?.some(
    like => like.user?.toString() === currentUserId.toString()
  ) : false;

  // Build formatted comment
  return {
    id: commentObj._id,
    postId: commentObj.post,
    content: commentObj.content,
    author: commentObj.author,
    likes: likesCount,
    isLiked,
    status: commentObj.status,
    isEdited: commentObj.isEdited || false,
    createdAt: commentObj.createdAt,
    updatedAt: commentObj.updatedAt,
    parentComment: commentObj.parentComment || null,
    replyCount: commentObj.replies?.length || 0
  };
};

/**
 * Format multiple comments
 */
const formatComments = (comments, req, currentUser = null) => {
  if (!Array.isArray(comments)) {
    return [];
  }

  return comments.map(comment => formatComment(comment, req, currentUser));
};

module.exports = {
  formatComment,
  formatComments
};