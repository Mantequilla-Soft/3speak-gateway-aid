import { Router } from 'express';
import { SQLiteManager } from '../services/sqlite';
import { MongoDBConnector } from '../services/mongodb';
import { logger } from '../utils/logger';
import { ApiResponse, Encoder } from '../types/index';
import { config } from '../config/index';
import { basicAuthMiddleware } from '../utils/auth';

const router = Router();

// Lazy-load SQLite manager to prevent initialization at module load time
let sqliteManagerInstance: SQLiteManager | null = null;
function getSQLiteManager(): SQLiteManager {
  if (!sqliteManagerInstance) {
    sqliteManagerInstance = SQLiteManager.getInstance(config.sqlite.path);
  }
  return sqliteManagerInstance;
}

/**
 * GET /api/encoders/online
 * Get all online encoders (last seen within 5 minutes)
 */
router.get('/online', async (req, res) => {
  try {
    const mongoConnector = MongoDBConnector.getInstance();
    const onlineNodes = await mongoConnector.getOnlineClusterNodes();
    
    const response: ApiResponse = {
      success: true,
      data: onlineNodes
    };

    res.json(response);
  } catch (error) {
    logger.error('Error fetching online encoders', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to fetch online encoders'
    };
    res.status(500).json(response);
  }
});

/**
 * GET /api/encoders
 * Get all registered encoders with their last activity
 */
router.get('/', async (req, res) => {
  try {
    const sqliteManager = getSQLiteManager();
    const mongoConnector = MongoDBConnector.getInstance();
    const encoders = await sqliteManager.getAllEncoders();
    
    // Enrich encoders with last activity data from MongoDB
    const enrichedEncoders = await Promise.all(
      encoders.map(async (encoder) => {
        const lastActivity = await mongoConnector.getEncoderLastActivity(encoder.encoder_id);
        return {
          ...encoder,
          last_activity: lastActivity
        };
      })
    );
    
    const response: ApiResponse = {
      success: true,
      data: enrichedEncoders
    };

    res.json(response);
  } catch (error) {
    logger.error('Error fetching encoders', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to fetch encoders'
    };
    res.status(500).json(response);
  }
});

/**
 * GET /api/encoders/:id
 * Get a specific encoder by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const sqliteManager = getSQLiteManager();
    const { id } = req.params;
    const encoder = await sqliteManager.getEncoderById(id);
    
    if (!encoder) {
      const response: ApiResponse = {
        success: false,
        error: 'Encoder not found'
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse<Encoder> = {
      success: true,
      data: encoder
    };

    res.json(response);
  } catch (error) {
    logger.error(`Error fetching encoder ${req.params.id}`, error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to fetch encoder'
    };
    res.status(500).json(response);
  }
});

/**
 * POST /api/encoders
 * Register a new encoder
 * @protected Requires admin authentication
 */
router.post('/', basicAuthMiddleware, async (req, res) => {
  try {
    const sqliteManager = getSQLiteManager();
    const { encoder_id, name, owner, location, hardware_type } = req.body;
    
    // Validate required fields
    if (!encoder_id || !name || !owner) {
      const response: ApiResponse = {
        success: false,
        error: 'encoder_id, name, and owner are required fields'
      };
      return res.status(400).json(response);
    }

    // Check if encoder already exists
    const existingEncoder = await sqliteManager.getEncoderById(encoder_id);
    if (existingEncoder) {
      const response: ApiResponse = {
        success: false,
        error: 'Encoder with this ID already exists'
      };
      return res.status(409).json(response);
    }

    const newEncoder: Omit<Encoder, 'created_at' | 'last_seen'> = {
      encoder_id,
      name,
      owner,
      location,
      hardware_type,
      is_active: true
    };

    await sqliteManager.upsertEncoder(newEncoder);

    const response: ApiResponse<Encoder> = {
      success: true,
      data: {
        ...newEncoder,
        created_at: new Date(),
        last_seen: new Date()
      },
      message: 'Encoder registered successfully'
    };

    res.status(201).json(response);
  } catch (error) {
    logger.error('Error registering encoder', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to register encoder'
    };
    res.status(500).json(response);
  }
});

/**
 * PUT /api/encoders/:id
 * Update encoder information
 * @protected Requires admin authentication
 */
router.put('/:id', basicAuthMiddleware, async (req, res) => {
  try {
    const sqliteManager = getSQLiteManager();
    const { id } = req.params;
    const updates = req.body;

    // Remove encoder_id and created_at from updates to prevent overwriting
    delete updates.encoder_id;
    delete updates.created_at;

    // Check if encoder exists
    const existingEncoder = await sqliteManager.getEncoderById(id);
    if (!existingEncoder) {
      const response: ApiResponse = {
        success: false,
        error: 'Encoder not found'
      };
      return res.status(404).json(response);
    }

    await sqliteManager.updateEncoder(id, updates);

    // Fetch updated encoder
    const updatedEncoder = await sqliteManager.getEncoderById(id);

    const response: ApiResponse<Encoder> = {
      success: true,
      data: updatedEncoder!,
      message: 'Encoder updated successfully'
    };

    res.json(response);
  } catch (error) {
    logger.error(`Error updating encoder ${req.params.id}`, error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to update encoder'
    };
    res.status(500).json(response);
  }
});

/**
 * DELETE /api/encoders/:id
 * Delete an encoder
 * @protected Requires admin authentication
 */
router.delete('/:id', basicAuthMiddleware, async (req, res) => {
  try {
    const sqliteManager = getSQLiteManager();
    const { id } = req.params;

    // Check if encoder exists
    const existingEncoder = await sqliteManager.getEncoderById(id);
    if (!existingEncoder) {
      const response: ApiResponse = {
        success: false,
        error: 'Encoder not found'
      };
      return res.status(404).json(response);
    }

    await sqliteManager.deleteEncoder(id);

    const response: ApiResponse = {
      success: true,
      message: 'Encoder deleted successfully'
    };

    res.json(response);
  } catch (error) {
    logger.error(`Error deleting encoder ${req.params.id}`, error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to delete encoder'
    };
    res.status(500).json(response);
  }
});

/**
 * POST /api/encoders/:id/heartbeat
 * Update encoder last seen timestamp (heartbeat)
 */
router.post('/:id/heartbeat', async (req, res) => {
  try {
    const sqliteManager = getSQLiteManager();
    const { id } = req.params;
    const { status, current_job_id } = req.body;

    // Check if encoder exists
    const existingEncoder = await sqliteManager.getEncoderById(id);
    if (!existingEncoder) {
      const response: ApiResponse = {
        success: false,
        error: 'Encoder not found'
      };
      return res.status(404).json(response);
    }

    // Update last seen and any provided status
    const updates: any = {};
    if (status !== undefined) {
      updates.is_active = status === 'online' || status === 'busy';
    }
    if (current_job_id !== undefined) {
      updates.current_job_id = current_job_id;
    }

    await sqliteManager.updateEncoder(id, updates);

    const response: ApiResponse = {
      success: true,
      message: 'Heartbeat recorded'
    };

    res.json(response);
  } catch (error) {
    logger.error(`Error recording heartbeat for encoder ${req.params.id}`, error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to record heartbeat'
    };
    res.status(500).json(response);
  }
});

/**
 * GET /api/encoders/:id/stats
 * Get statistics for a specific encoder
 */
router.get('/:id/stats', async (req, res) => {
  try {
    const sqliteManager = getSQLiteManager();
    const { id } = req.params;
    const days = parseInt(req.query.days as string) || 30;

    // Check if encoder exists
    const existingEncoder = await sqliteManager.getEncoderById(id);
    if (!existingEncoder) {
      const response: ApiResponse = {
        success: false,
        error: 'Encoder not found'
      };
      return res.status(404).json(response);
    }

    const stats = await sqliteManager.getEncoderStats(id, days);

    const response: ApiResponse = {
      success: true,
      data: stats
    };

    res.json(response);
  } catch (error) {
    logger.error(`Error fetching stats for encoder ${req.params.id}`, error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to fetch encoder stats'
    };
    res.status(500).json(response);
  }
});

export default router;