import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index';
import { logger } from './logger';

/**
 * HTTP Basic Authentication middleware for admin operations
 * Validates credentials against ADMIN_USERNAME and ADMIN_PASSWORD from config
 */
export function basicAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Check if admin password is configured
  if (!config.admin.password) {
    logger.error('ADMIN_PASSWORD not configured in environment variables');
    res.status(500).json({
      success: false,
      error: 'Admin authentication not configured'
    });
    return;
  }

  // Get the Authorization header
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Gateway Monitor Admin"');
    res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
    return;
  }

  try {
    // Decode the Base64 credentials
    const base64Credentials = authHeader.substring(6); // Remove 'Basic ' prefix
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    // Validate credentials
    if (username === config.admin.username && password === config.admin.password) {
      logger.info(`Admin authenticated: ${username}`);
      next();
      return;
    }

    // Invalid credentials
    logger.warn(`Failed admin authentication attempt for username: ${username}`);
    res.setHeader('WWW-Authenticate', 'Basic realm="Gateway Monitor Admin"');
    res.status(401).json({
      success: false,
      error: 'Invalid credentials'
    });
  } catch (error) {
    logger.error('Error processing authentication', error);
    res.status(401).json({
      success: false,
      error: 'Authentication failed'
    });
  }
}
