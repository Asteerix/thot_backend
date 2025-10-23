/**
 * Health Check pour Clever Cloud
 * Ce fichier fournit un health check qui retourne toujours 200
 * même si MongoDB n'est pas encore connecté, pour éviter
 * que Clever Cloud considère le déploiement comme échoué
 */

const mongoose = require('mongoose');

/**
 * Health check adapté pour Clever Cloud
 * Retourne toujours 200 mais signale l'état de la DB
 */
const cleverHealthCheck = (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;

  const health = {
    status: 'ok', // Toujours OK pour Clever Cloud
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: {
      connected: isDbConnected,
      readyState: getReadyStateName(mongoose.connection.readyState),
      // Ne pas inclure host/name si pas connecté pour éviter les erreurs
      ...(isDbConnected && {
        host: mongoose.connection.host,
        name: mongoose.connection.name
      })
    },
    environment: process.env.NODE_ENV || 'production',
    nodeVersion: process.version,
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      unit: 'MB'
    }
  };

  // Toujours retourner 200 pour que Clever Cloud considère l'app comme healthy
  // Même si la DB n'est pas encore connectée
  res.status(200).json(health);
};

/**
 * Health check détaillé pour monitoring interne
 * Peut retourner 503 si des services critiques sont down
 */
const detailedHealthCheck = (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;

  const health = {
    success: true,
    status: isDbConnected ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mongodb: {
      status: isDbConnected ? 'connected' : 'disconnected',
      readyState: mongoose.connection.readyState,
      readyStateName: getReadyStateName(mongoose.connection.readyState),
      ...(isDbConnected && {
        host: mongoose.connection.host || 'unknown',
        name: mongoose.connection.name || 'unknown'
      })
    },
    environment: process.env.NODE_ENV || 'production',
    nodeVersion: process.version,
    memory: process.memoryUsage(),
    checks: {
      mongodb: isDbConnected ? 'pass' : 'fail',
      server: 'pass'
    }
  };

  // Retourner 503 si la DB n'est pas connectée (pour monitoring interne)
  const statusCode = isDbConnected ? 200 : 503;
  res.status(statusCode).json(health);
};

/**
 * Convertit le readyState en nom lisible
 */
function getReadyStateName(state) {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
    99: 'uninitialized'
  };
  return states[state] || 'unknown';
}

module.exports = {
  cleverHealthCheck,
  detailedHealthCheck
};
