import winston from 'winston';
import { config } from '../config/index';

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaString = '';
    if (Object.keys(meta).length) {
      try {
        // Safe stringify with circular reference handling
        metaString = JSON.stringify(meta, (key, value) => {
          if (value instanceof Error) {
            return {
              name: value.name,
              message: value.message,
              stack: value.stack
            };
          }
          if (typeof value === 'object' && value !== null) {
            // Skip circular references and large objects
            if (value.constructor && (value.constructor.name === 'Agent' || value.constructor.name === 'ClientRequest')) {
              return '[Circular/Agent]';
            }
          }
          return value;
        }, 2);
      } catch (err) {
        metaString = '[Unable to stringify metadata]';
      }
    }
    return `${timestamp} [${level}]: ${message} ${metaString}`;
  })
);

// Create logger instance
export const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: { service: 'gateway-monitor' },
  transports: [
    // Console output
    new winston.transports.Console({
      format: config.nodeEnv === 'development' ? consoleFormat : logFormat
    }),
    
    // File outputs
    new winston.transports.File({
      filename: './logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    
    new winston.transports.File({
      filename: './logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ],
  
  // Handle exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({ filename: './logs/exceptions.log' })
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: './logs/rejections.log' })
  ]
});

// Create logs directory if it doesn't exist
import { mkdirSync } from 'fs';
try {
  mkdirSync('./logs', { recursive: true });
} catch (error) {
  // Directory might already exist
}

// Add request logging helper
export const logRequest = (req: any, res: any, next: any) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP Request', {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
  });
  
  next();
};

export default logger;