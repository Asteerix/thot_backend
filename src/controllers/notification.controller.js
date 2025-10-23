/* eslint-disable */
const Notification = require('../models/notification.model');
const User = require('../models/user.model');
const ResponseHelper = require('../utils/responseHelper');
// Removed buildMediaUrl - returning relative URLs

// Helper function to format notification
const formatNotification = (req, notification) => {
  const notificationObj = notification.toObject ? notification.toObject() : notification;
  
  if (notificationObj.sender && typeof notificationObj.sender === 'object') {
    // Set default avatar if not present
    if (!notificationObj.sender.avatarUrl) {
      const isJournalist = notificationObj.sender.role === 'journalist';
      notificationObj.sender.avatarUrl = isJournalist 
        ? '/assets/images/defaults/default_journalist_avatar.png'
        : '/assets/images/defaults/default_user_avatar.png';
    }
    // Otherwise keep existing relative URL
  }
  
  return notificationObj;
};

// Obtenir toutes les notifications de l'utilisateur
exports.getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, type } = req.query;
    const skip = (page - 1) * limit;

    // Build query
    const query = { recipient: req.userId };
    
    // Add type filter if provided
    if (type && type !== 'all') {
      // Support filtering for comment-related notifications
      if (type === 'comment') {
        query.type = { $in: ['comment_reply', 'comment_like', 'mention'] };
      } else {
        query.type = type;
      }
    }

    const notifications = await Notification.find(query)
      .populate('sender', 'username avatarUrl profileImage name role')
      .populate({
        path: 'postId',
        select: 'title type coverImage'
      })
      .populate({
        path: 'commentId',
        select: 'content'
      })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const totalNotifications = await Notification.countDocuments(query);
    const unreadCount = await Notification.getUnreadCount(req.userId);

    // Format notifications with proper avatar URLs
    const formattedNotifications = notifications.map(notification => 
      formatNotification(req, notification)
    );

    ResponseHelper.success(res, {
      notifications: formattedNotifications,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalNotifications / limit),
      totalNotifications,
      unreadCount
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    ResponseHelper.serverError(res, error, 'Failed to fetch notifications');
  }
};

// Obtenir le nombre de notifications non lues
exports.getUnreadCount = async (req, res) => {
  try {
    const unreadCount = await Notification.getUnreadCount(req.userId);
    ResponseHelper.success(res, { unreadCount });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    ResponseHelper.serverError(res, error, 'Failed to fetch unread count');
  }
};

// Marquer une notification comme lue
exports.markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.notificationId,
      recipient: req.userId
    });

    if (!notification) {
      return ResponseHelper.notFound(res, 'Notification');
    }

    await notification.markAsRead();
    ResponseHelper.success(res, { notification });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    ResponseHelper.serverError(res, error, 'Failed to mark notification as read');
  }
};

// Marquer toutes les notifications comme lues
exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.markAllAsRead(req.userId);
    ResponseHelper.success(res, null, 'All notifications marked as read');
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    ResponseHelper.serverError(res, error, 'Failed to mark all notifications as read');
  }
};

// Supprimer une notification
exports.deleteNotification = async (req, res) => {
  try {
    const _result = await Notification.findOneAndDelete({
      _id: req.params.notificationId,
      recipient: req.userId
    });

    if (!result) {
      return ResponseHelper.notFound(res, 'Notification');
    }

    ResponseHelper.success(res, null, 'Notification deleted successfully');
  } catch (error) {
    console.error('Error deleting notification:', error);
    ResponseHelper.serverError(res, error, 'Failed to delete notification');
  }
};

// Supprimer toutes les notifications lues
exports.deleteReadNotifications = async (req, res) => {
  try {
    await Notification.deleteMany({
      recipient: req.userId,
      isRead: true
    });

    ResponseHelper.success(res, null, 'Read notifications deleted successfully');
  } catch (error) {
    console.error('Error deleting read notifications:', error);
    ResponseHelper.serverError(res, error, 'Failed to delete read notifications');
  }
};

// Obtenir les préférences de notifications
exports.getPreferences = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('preferences.notifications');

    if (!user) {
      return ResponseHelper.notFound(res, 'User');
    }

    // Si les préférences n'existent pas, retourner les valeurs par défaut
    const defaultPreferences = {
      enabled: true,
      likes: true,
      comments: true,
      follows: true,
      mentions: true,
      posts: true,
      polls: true,
      sound: true
    };

    const preferences = user.preferences?.notifications || defaultPreferences;
    
    ResponseHelper.success(res, { preferences });
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    ResponseHelper.serverError(res, error, 'Failed to fetch notification preferences');
  }
};

// Mettre à jour les préférences de notifications
exports.updatePreferences = async (req, res) => {
  try {
    const updates = req.body;
    
    // Valider les clés autorisées
    const allowedKeys = ['enabled', 'likes', 'comments', 'follows', 'mentions', 'posts', 'polls', 'sound'];
    const updateKeys = Object.keys(updates);
    
    const isValidUpdate = updateKeys.every(key => allowedKeys.includes(key));
    if (!isValidUpdate) {
      return ResponseHelper.validationError(res, ['Invalid preference keys']);
    }

    // Construire l'objet de mise à jour
    const updateObject = {};
    updateKeys.forEach(key => {
      updateObject[`preferences.notifications.${key}`] = updates[key];
    });

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: updateObject },
      { new: true, runValidators: true }
    ).select('preferences.notifications');

    if (!user) {
      return ResponseHelper.notFound(res, 'User');
    }

    ResponseHelper.success(res, { 
      preferences: user.preferences.notifications 
    }, 'Preferences updated successfully');
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    ResponseHelper.serverError(res, error, 'Failed to update notification preferences');
  }
};
