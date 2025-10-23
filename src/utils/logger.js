const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for better readability
const customFormat = winston.format.printf(({ level, message, timestamp, stack, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;

  // Add stack trace for errors
  if (stack) {
    msg += `\n${stack}`;
  }

  // Add metadata if present
  const metaKeys = Object.keys(metadata);
  if (metaKeys.length > 0 && metaKeys[0] !== 'service') {
    msg += `\n${JSON.stringify(metadata, null, 2)}`;
  }

  return msg;
});

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat()
  ),
  defaultMeta: { service: 'thot-backend' },
  transports: [
    // Write all logs with level `error` and below to `error.log`
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: winston.format.combine(
        winston.format.json()
      )
    }),
    // Write all logs to `combined.log`
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: winston.format.combine(
        winston.format.json()
      )
    })
  ]
});

// Always add console transport with custom format for better DX
logger.add(new winston.transports.Console({
  format: winston.format.combine(
    winston.format.colorize(),
    customFormat
  )
}));

// Create a stream object with a 'write' function that will be used by `morgan`
logger.stream = {
  write: function(message) {
    // Use the 'info' log level so the output will be picked up by both transports
    logger.info(message.trim());
  }
};

// Add convenience methods for different log levels
logger.debug = logger.debug.bind(logger);
logger.info = logger.info.bind(logger);
logger.warn = logger.warn.bind(logger);
logger.error = logger.error.bind(logger);

module.exports = logger;
