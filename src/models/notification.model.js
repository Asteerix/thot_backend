const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: [
      'post_like',
      'comment_like',
      'comment_reply',
      'new_follower',
      'post_removed',
      'article_published',
      'mention',
      'new_post_from_followed'
    ],
    required: true
  },
  entityType: {
    type: String,
    enum: ['post', 'comment', 'user'],
    required: true
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  postId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post'
  },
  commentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment'
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  isRead: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index pour améliorer les performances
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ createdAt: -1 });

// Méthode pour marquer comme lu
notificationSchema.methods.markAsRead = async function() {
  this.isRead = true;
  return this.save();
};

// Méthode statique pour créer différents types de notifications
notificationSchema.statics.createNotification = async function(data) {
  const { type, sender, recipient, entityId, entityType, postId, commentId } = data;

  // Validation des paramètres requis
  if (!sender || !recipient || !type || !entityId || !entityType) {
    console.error('Missing required notification fields:', { sender, recipient, type, entityId, entityType });
    return null;
  }

  // Ne pas créer de notification si l'expéditeur est le destinataire
  if (sender.toString() === recipient.toString()) {
    return null;
  }

  // Vérifier le spam - pour like/unlike et follow/unfollow
  const spamTypes = ['post_like', 'new_follower'];
  if (spamTypes.includes(type)) {
    // Vérifier les notifications récentes similaires
    const recentTimeLimit = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes
    const recentSimilar = await this.findOne({
      recipient,
      sender,
      type,
      entityId,
      createdAt: { $gte: recentTimeLimit }
    });

    if (recentSimilar) {
      // Mise à jour de la notification existante au lieu d'en créer une nouvelle
      recentSimilar.createdAt = new Date();
      recentSimilar.isRead = false;
      return recentSimilar.save();
    }

    // Vérifier le spam pattern (plus de 3 actions similaires en 1 minute)
    const spamTimeLimit = new Date(Date.now() - 60 * 1000); // 1 minute
    const spamCount = await this.countDocuments({
      recipient,
      sender,
      type,
      createdAt: { $gte: spamTimeLimit }
    });

    if (spamCount >= 3) {
      console.log('Spam pattern detected, skipping notification:', { sender, recipient, type });
      return null;
    }
  }

  let title = '';
  let message = '';

  switch (type) {
  case 'post_like':
    title = 'Nouveau j\'aime';
    message = 'a aimé votre publication';
    break;
  case 'comment_like':
    title = 'Nouveau j\'aime';
    message = 'a aimé votre commentaire';
    break;
  case 'comment_reply':
    title = 'Nouvelle réponse';
    message = 'a répondu à votre commentaire';
    break;
  case 'new_follower':
    title = 'Nouvel abonné';
    message = 'a commencé à vous suivre';
    break;
  case 'post_removed':
    title = 'Publication supprimée';
    message = 'Votre publication a été supprimée suite à des signalements';
    break;
  case 'article_published':
    title = 'Nouvel article';
    message = 'a publié un nouvel article';
    break;
  case 'mention':
    title = 'Nouvelle mention';
    message = 'vous a mentionné dans un commentaire';
    break;
  case 'new_post_from_followed':
    title = 'Nouvelle publication';
    message = 'a publié une nouvelle publication';
    break;
  default:
    title = 'Notification';
    message = 'Nouvelle notification';
  }

  const notification = new this({
    recipient,
    sender,
    type,
    entityType,
    entityId,
    postId,
    commentId,
    title,
    message
  });

  return notification.save();
};

// Méthode pour obtenir les notifications non lues
notificationSchema.statics.getUnreadCount = async function(userId) {
  return this.countDocuments({ recipient: userId, isRead: false });
};

// Méthode pour marquer toutes les notifications comme lues
notificationSchema.statics.markAllAsRead = async function(userId) {
  return this.updateMany(
    { recipient: userId, isRead: false },
    { $set: { isRead: true } }
  );
};

// Méthode pour nettoyer les vieilles notifications (plus de 30 jours)
notificationSchema.statics.cleanOldNotifications = async function() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  return this.deleteMany({
    createdAt: { $lt: thirtyDaysAgo },
    isRead: true
  });
};

module.exports = mongoose.model('Notification', notificationSchema);
