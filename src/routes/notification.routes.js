const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const { auth, requireActiveStatus, updateLastActive } = require('../middleware/auth.middleware');

// Toutes les routes nécessitent une authentification
router.use(auth);
router.use(updateLastActive);

// Routes accessibles même pour les utilisateurs suspendus
// (pour qu'ils puissent voir leurs notifications de suspension)
router.get('/', notificationController.getNotifications);
router.get('/unread-count', notificationController.getUnreadCount);

// Les autres routes nécessitent un compte actif
router.use(requireActiveStatus);

// Marquer une notification comme lue
router.patch('/:notificationId/read', notificationController.markAsRead);

// Marquer toutes les notifications comme lues
router.patch('/mark-all-read', notificationController.markAllAsRead);

// Supprimer toutes les notifications lues (must be before /:notificationId)
router.delete('/delete-read', notificationController.deleteReadNotifications);

// Supprimer une notification
router.delete('/:notificationId', notificationController.deleteNotification);

// Obtenir les préférences de notifications
router.get('/preferences', notificationController.getPreferences);

// Mettre à jour les préférences de notifications
router.put('/preferences', notificationController.updatePreferences);

module.exports = router;
