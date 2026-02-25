import { Router } from 'express';
import { MongoDBConnector } from '../services/mongodb';
import { logger } from '../utils/logger';
import { ApiResponse } from '../types/index';
import { basicAuthMiddleware } from '../utils/auth';
import { config } from '../config';

const router = Router();

let mongodb: MongoDBConnector;

const getServices = () => {
  if (!mongodb) {
    mongodb = MongoDBConnector.getInstance();
  }
  return { mongodb };
};

/**
 * GET /api/direct-encoding/jobs
 * Get direct encoding jobs (embed-jobs) with video metadata
 */
router.get('/jobs', async (req, res) => {
  try {
    const { mongodb } = getServices();
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 30;
    
    const jobs = await mongodb.getEmbedJobs(limit);
    
    const response: ApiResponse = {
      success: true,
      data: jobs
    };

    res.json(response);
  } catch (error) {
    logger.error('Error fetching embed jobs', error);
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch embed jobs'
    };
    res.status(500).json(response);
  }
});

/**
 * GET /api/direct-encoding/stats
 * Get statistics about direct encoding jobs
 */
router.get('/stats', async (req, res) => {
  try {
    const { mongodb } = getServices();
    
    const stats = await mongodb.getEmbedJobStats();
    
    const response: ApiResponse = {
      success: true,
      data: stats
    };

    res.json(response);
  } catch (error) {
    logger.error('Error fetching embed job stats', error);
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch embed job stats'
    };
    res.status(500).json(response);
  }
});

/**
 * POST /api/direct-encoding/jobs/:owner/:permlink/redispatch
 * Proxy endpoint to redispatch a job via embed video service
 * @protected Requires admin authentication
 */
router.post('/jobs/:owner/:permlink/redispatch', basicAuthMiddleware, async (req, res) => {
  try {
    const { owner, permlink } = req.params;
    
    logger.info(`Admin redispatch request for job: ${owner}/${permlink}`);

    // Get the embed service admin password from config
    const embedAdminPassword = process.env.EMBED_ADMIN_PASSWORD || config.admin.password;
    
    if (!embedAdminPassword) {
      logger.error('EMBED_ADMIN_PASSWORD not configured');
      return res.status(500).json({
        success: false,
        error: 'Embed admin password not configured on server'
      });
    }

    // Forward the request to the embed video service
    const embedApiUrl = `https://embed.3speak.tv/admin/jobs/${owner}/${permlink}/redispatch`;
    
    const embedResponse = await fetch(embedApiUrl, {
      method: 'POST',
      headers: {
        'X-Admin-Password': embedAdminPassword
      }
    });

    const embedData = await embedResponse.json().catch(() => ({})) as any;

    if (!embedResponse.ok) {
      logger.error(`Embed service redispatch failed: ${embedResponse.status}`, embedData);
      return res.status(embedResponse.status).json({
        success: false,
        error: embedData.error || `Embed service returned ${embedResponse.status}`
      });
    }

    logger.info(`Job ${owner}/${permlink} successfully redispatched`);
    res.json(embedData);
  } catch (error) {
    logger.error('Error proxying redispatch request', error);
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to redispatch job'
    };
    res.status(500).json(response);
  }
});

export default router;
