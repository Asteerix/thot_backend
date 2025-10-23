const config = {
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || ''
    }
  },

  from: {
    default: process.env.EMAIL_FROM || 'noreply@thot.com',
    support: process.env.EMAIL_SUPPORT || 'support@thot.com',
    admin: process.env.EMAIL_ADMIN || 'admin@thot.com'
  },

  templates: {
    verification: {
      subject: 'Vérifiez votre compte THOT',
      expiresIn: 24 * 60 * 60 * 1000 // 24 hours
    },
    resetPassword: {
      subject: 'Réinitialisation de votre mot de passe THOT',
      expiresIn: 60 * 60 * 1000 // 1 hour
    },
    welcome: {
      subject: 'Bienvenue sur THOT'
    },
    journalistApproved: {
      subject: 'Votre demande de journaliste a été approuvée'
    },
    journalistRejected: {
      subject: 'Votre demande de journaliste a été refusée'
    }
  },

  queue: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  },

  enabled: process.env.EMAIL_ENABLED !== 'false'
};

module.exports = config;