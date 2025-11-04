import { Request, Response, NextFunction } from 'express';
import { SQLiteManager } from '../services/sqlite';
import { logger } from '../utils/logger';
import { AidErrorCode, ApiResponse } from '../types/index';

// Extend Express Request to include encoder info
declare global {
  namespace Express {
    interface Request {
      encoder?: {
        encoder_id: string;
        name: string;
        owner: string;
        is_active: boolean;
      };
    }
  }
}

/**
 * Middleware to validate encoder DID authorization
 * Checks if encoder exists in SQLite database and is active
 */
export const validateEncoderDID = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { encoder_did } = req.body;

    // Check if encoder_did is provided
    if (!encoder_did) {
      const response: ApiResponse = {
        success: false,
        error: 'encoder_did is required',
        data: { code: AidErrorCode.INVALID_REQUEST }
      };
      res.status(400).json(response);
      return;
    }

    // Get SQLite manager instance
    const sqliteManager = SQLiteManager.getInstance();

    // Check if encoder exists in database
    const encoder = await sqliteManager.getEncoderById(encoder_did);

    if (!encoder) {
      logger.warn('Unauthorized encoder DID attempted access', { encoder_did });
      const response: ApiResponse = {
        success: false,
        error: 'Encoder not authorized',
        data: { code: AidErrorCode.ENCODER_NOT_AUTHORIZED }
      };
      res.status(403).json(response);
      return;
    }

    // Check if encoder is active
    if (!encoder.is_active) {
      logger.warn('Inactive encoder attempted access', {
        encoder_did,
        encoder_name: encoder.name
      });
      const response: ApiResponse = {
        success: false,
        error: 'Encoder is inactive',
        data: { code: AidErrorCode.ENCODER_INACTIVE }
      };
      res.status(403).json(response);
      return;
    }

    // Attach encoder info to request for use in route handlers
    req.encoder = {
      encoder_id: encoder.encoder_id,
      name: encoder.name,
      owner: encoder.owner,
      is_active: encoder.is_active
    };

    logger.debug('Encoder authorized', {
      encoder_did: encoder.encoder_id,
      encoder_name: encoder.name
    });

    next();
  } catch (error) {
    logger.error('Error in encoder authorization middleware', error);
    const response: ApiResponse = {
      success: false,
      error: 'Authorization check failed'
    };
    res.status(500).json(response);
  }
};
