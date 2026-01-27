import { Router } from 'express';
import { MongoDBConnector } from '../services/mongodb';
import { logger } from '../utils/logger';
import { ApiResponse } from '../types/index';

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

export default router;
