const config = {
  dsn: process.env.SENTRY_DSN || '',
  environment: process.env.NODE_ENV || 'development',
  enabled: process.env.SENTRY_ENABLED === 'true' && process.env.NODE_ENV === 'production',

  options: {
    integrations: (integrations) => {
      return integrations.filter((integration) => integration.name !== 'Console');
    },
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.1'),
    attachStacktrace: true,
    autoSessionTracking: true,
    sendDefaultPii: false,

    beforeSend(event, _hint) {
      // Filter out sensitive data
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers?.authorization;
        delete event.request.headers?.cookie;
      }

      // Don't send events in development
      if (process.env.NODE_ENV === 'development') {
        return null;
      }

      return event;
    },

    ignoreErrors: [
      'NetworkError',
      'Non-Error promise rejection captured',
      /^Request aborted/,
      /^Socket hang up/,
      /ECONNRESET/,
      /ETIMEDOUT/
    ]
  },

  release: process.env.SENTRY_RELEASE || `thot-backend@${process.env.npm_package_version || '1.0.0'}`
};

module.exports = config;