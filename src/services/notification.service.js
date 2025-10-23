/* eslint-disable */
const Notification = require('../models/notification.model');
const User = require('../models/user.model');
const socketService = require('./socket.service');

class NotificationService {
  // Créer une notification uniquement si les préférences de l'utilisateur le permettent
  static async createNotification({ type, recipient, sender, postId, commentId, message: _message, entityId, entityType }) {
    try {
      // Vérifier les paramètres requis
      if (!recipient || !sender || !type) {
        console.error('Missing required notification parameters:', { recipient, sender, type });
        return null;
      }

      // Récupérer les préférences de l'utilisateur
      const user = await User.findById(recipient).select('preferences.notifications');

      if (!user) {
        console.error('Recipient user not found:', recipient);
        return null;
      }

      const preferences = user.preferences?.notifications || {};
      
      // Vérifier si les notifications sont activées globalement
      if (preferences.enabled === false) {
        console.log('Notifications disabled for user:', recipient);
        return null;
      }

      // Mapper les types pour les préférences
      const typeToPreference = {
        'post_like': 'likes',
        'comment_like': 'likes',
        'comment_reply': 'comments',
        'new_follower': 'follows',
        'post_removed': 'posts',
        'article_published': 'posts',
        'mention': 'mentions',
        'new_post_from_followed': 'posts'
      };

      const preferenceKey = typeToPreference[type];
      if (preferenceKey && preferences[preferenceKey] === false) {
        console.log(`Notification type ${type} disabled for user:`, recipient);
        return null;
      }

      // Déterminer entityId et entityType si non fournis
      if (!entityId || !entityType) {
        if (postId) {
          entityId = postId;
          entityType = 'post';
        } else if (commentId) {
          entityId = commentId;
          entityType = 'comment';
        } else {
          entityId = sender;
          entityType = 'user';
        }
      }

      // Créer la notification en utilisant la méthode statique du modèle
      const notification = await Notification.createNotification({
        type,
        recipient,
        sender,
        postId,
        commentId,
        entityId,
        entityType
      });

      // Peupler les références
      const populatedNotification = await Notification.findById(notification._id)
        .populate('sender', 'username avatarUrl profileImage name role')
        .populate({
          path: 'postId',
          select: 'title type coverImage'
        })
        .populate({
          path: 'commentId',
          select: 'content'
        });

      // Send real-time notification via Socket.IO
      if (socketService && socketService.sendNotification) {
        await socketService.sendNotification(recipient, populatedNotification);
      }

      return populatedNotification;
    } catch (error) {
      console.error('Error creating notification:', error);
      return null;
    }
  }

  // Méthodes helpers pour créer différents types de notifications
  static async notifyLike(postId, likerId, postOwnerId) {
    if (!postOwnerId || !likerId || likerId.toString() === postOwnerId.toString()) return; // Ne pas notifier ses propres likes

    return this.createNotification({
      type: 'post_like',
      recipient: postOwnerId,
      sender: likerId,
      postId,
      message: 'a aimé votre publication',
      entityId: postId,
      entityType: 'post'
    });
  }

  static async notifyComment(postId, commentId, commenterId, postOwnerId) {
    if (!postOwnerId || !commenterId || commenterId.toString() === postOwnerId.toString()) return; // Ne pas notifier ses propres commentaires

    return this.createNotification({
      type: 'comment_reply',
      recipient: postOwnerId,
      sender: commenterId,
      postId,
      commentId,
      message: 'a commenté votre publication',
      entityId: commentId,
      entityType: 'comment'
    });
  }

  static async notifyFollow(followerId, followedId) {
    if (!followedId || !followerId) return;

    return this.createNotification({
      type: 'new_follower',
      recipient: followedId,
      sender: followerId,
      message: 's\'est abonné à vous',
      entityId: followerId,
      entityType: 'user'
    });
  }

  static async notifyMention(postId, mentionerId, mentionedId) {
    if (!mentionedId || !mentionerId) return;

    return this.createNotification({
      type: 'mention',
      recipient: mentionedId,
      sender: mentionerId,
      postId,
      message: 'vous a mentionné dans une publication',
      entityId: postId,
      entityType: 'post'
    });
  }

  static async notifyNewPost(postId, authorId, followerId) {
    if (!followerId || !authorId) return;

    return this.createNotification({
      type: 'new_post_from_followed',
      recipient: followerId,
      sender: authorId,
      postId,
      message: 'a publié un nouveau contenu',
      entityId: postId,
      entityType: 'post'
    });
  }

  static async notifyPollResponse(postId, responderId, pollOwnerId) {
    if (!pollOwnerId || !responderId || responderId.toString() === pollOwnerId.toString()) return;

    return this.createNotification({
      type: 'comment_reply',
      recipient: pollOwnerId,
      sender: responderId,
      postId,
      message: 'a répondu à votre sondage',
      entityId: postId,
      entityType: 'post'
    });
  }

  static async notifyPollResult(postId, participantId, authorId) {
    if (!participantId || !authorId) return;

    return this.createNotification({
      type: 'article_published',
      recipient: participantId,
      sender: authorId || participantId,
      postId,
      message: 'Les résultats du sondage sont disponibles',
      entityId: postId,
      entityType: 'post'
    });
  }

  // Notifier tous les followers d'un utilisateur d'une nouvelle publication
  static async notifyFollowersOfNewPost(postId, authorId) {
    try {
      const author = await User.findById(authorId).select('followers');
      if (!author || !author.followers || author.followers.length === 0) return;

      // Créer des notifications pour tous les followers
      const notifications = await Promise.all(
        author.followers.map(followerId => 
          this.notifyNewPost(postId, authorId, followerId)
        )
      );

      return notifications.filter(n => n !== null);
    } catch (error) {
      console.error('Error notifying followers:', error);
      return [];
    }
  }
}

module.exports = NotificationService;
