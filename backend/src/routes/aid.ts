import express, { Request, Response } from 'express';
import { MongoDBConnector } from '../services/mongodb';
import { AidTimeoutMonitor } from '../services/aid-timeout-monitor';
import { validateEncoderDID } from '../middleware/aid-auth';
import { logger } from '../utils/logger';
import {
  ApiResponse,
  AidHealthResponse,
  AidJobListResponse,
  AidJobSummary,
  AidClaimJobRequest,
  AidClaimJobResponse,
  AidJobDetails,
  AidUpdateJobRequest,
  AidUpdateJobResponse,
  AidCompleteJobRequest,
  AidCompleteJobResponse,
  AidErrorCode
} from '../types/index';

const router = express.Router();

/**
 * GET /aid/v1/health
 * Health check endpoint (no auth required)
 */
router.get('/v1/health', async (req: Request, res: Response) => {
  try {
    const mongoConnector = MongoDBConnector.getInstance();
    const isConnected = mongoConnector['connected']; // Access private field for health check

    const response: AidHealthResponse = {
      status: isConnected ? 'healthy' : 'unhealthy',
      timestamp: new Date(),
      mongodb_connected: isConnected,
      version: '1.0.0'
    };

    res.json(response);
  } catch (error) {
    logger.error('Aid health check failed', error);
    const response: AidHealthResponse = {
      status: 'unhealthy',
      timestamp: new Date(),
      mongodb_connected: false,
      version: '1.0.0'
    };
    res.status(503).json(response);
  }
});

/**
 * POST /aid/v1/list-jobs
 * List available jobs for claiming
 * Requires DID authorization
 */
router.post('/v1/list-jobs', validateEncoderDID, async (req: Request, res: Response) => {
  try {
    const mongoConnector = MongoDBConnector.getInstance();
    const jobs = await mongoConnector.listAvailableJobsForAid();

    // Map to summary format (matches spec - full Job objects with id, metadata, etc.)
    const jobSummaries: AidJobSummary[] = jobs.map(job => ({
      id: job.id,
      created_at: job.created_at,
      metadata: job.metadata,
      storageMetadata: job.storageMetadata,
      input: job.input
    }));

    const response: AidJobListResponse = {
      success: true,
      jobs: jobSummaries
    };

    logger.info(`Encoder ${req.encoder?.encoder_id} listed ${jobSummaries.length} available jobs`);
    res.json(response);
  } catch (error) {
    logger.error('Failed to list jobs for Aid', error);
    const response: AidJobListResponse = {
      success: false,
      error: 'Failed to retrieve job list',
      code: 'INTERNAL_ERROR',
      jobs: []
    };
    res.status(500).json(response);
  }
});

/**
 * POST /aid/v1/claim-job
 * Atomically claim a job for processing
 * Requires DID authorization
 */
router.post('/v1/claim-job', validateEncoderDID, async (req: Request, res: Response) => {
  try {
    const { job_id } = req.body as AidClaimJobRequest;

    if (!job_id) {
      const response: AidClaimJobResponse = {
        success: false,
        error: 'Missing job_id',
        code: AidErrorCode.INVALID_REQUEST
      };
      return res.status(400).json(response);
    }

    const encoderDid = req.encoder!.encoder_id;
    const mongoConnector = MongoDBConnector.getInstance();
    
    const claimedJob = await mongoConnector.claimJobForAid(job_id, encoderDid);

    if (!claimedJob) {
      const response: AidClaimJobResponse = {
        success: false,
        error: 'Job not available for claiming',
        code: AidErrorCode.JOB_ALREADY_ASSIGNED
      };
      return res.status(409).json(response);
    }

    // Map to detailed format (matches spec)
    const jobDetails: AidJobDetails = {
      input: claimedJob.input,
      metadata: claimedJob.metadata,
      storageMetadata: claimedJob.storageMetadata
    };

    const response: AidClaimJobResponse = {
      success: true,
      job_id: claimedJob.id,
      assigned_to: claimedJob.assigned_to!,
      assigned_at: claimedJob.assigned_date!,
      job_details: jobDetails
    };

    // Check if this is the first Aid-serviced job for Discord alert
    const isFirst = await mongoConnector.isFirstAidServicedJob();
    if (isFirst) {
      const timeoutMonitor = AidTimeoutMonitor.getInstance();
      await timeoutMonitor.checkAndAlertFallbackActivation();
      logger.warn(`🚨 GATEWAY AID ACTIVATED: First job claimed via fallback system (${job_id})`);
    }

    logger.info(`Job ${job_id} claimed by ${encoderDid} via Aid system`);
    res.json(response);
  } catch (error) {
    logger.error('Failed to claim job for Aid', error);
    const response: AidClaimJobResponse = {
      success: false,
      error: 'Failed to claim job',
      code: 'INTERNAL_ERROR'
    };
    res.status(500).json(response);
  }
});

/**
 * POST /aid/v1/update-job
 * Update job progress
 * Requires DID authorization
 */
router.post('/v1/update-job', validateEncoderDID, async (req: Request, res: Response) => {
  try {
    const { 
      job_id, 
      status,
      progress 
    } = req.body as AidUpdateJobRequest;

    if (!job_id || !status || !progress) {
      const response: AidUpdateJobResponse = {
        success: false,
        error: 'Missing required fields: job_id, status, progress',
        code: AidErrorCode.INVALID_REQUEST
      };
      return res.status(400).json(response);
    }

    if (progress.pct < 0 || progress.pct > 100) {
      const response: AidUpdateJobResponse = {
        success: false,
        error: 'Progress pct must be between 0 and 100',
        code: AidErrorCode.INVALID_REQUEST
      };
      return res.status(400).json(response);
    }

    const encoderDid = req.encoder!.encoder_id;
    const mongoConnector = MongoDBConnector.getInstance();
    
    const updated = await mongoConnector.updateJobProgressForAid(
      job_id,
      encoderDid,
      status,
      progress
    );

    if (!updated) {
      const response: AidUpdateJobResponse = {
        success: false,
        error: 'Job not found or not assigned to this encoder',
        code: AidErrorCode.JOB_NOT_FOUND
      };
      return res.status(404).json(response);
    }

    const response: AidUpdateJobResponse = {
      success: true,
      job_id,
      status,
      updated_at: new Date()
    };

    logger.debug(`Job ${job_id} progress updated to ${progress.pct}% by ${encoderDid}`);
    res.json(response);
  } catch (error) {
    logger.error('Failed to update job for Aid', error);
    const response: AidUpdateJobResponse = {
      success: false,
      error: 'Failed to update job',
      code: 'INTERNAL_ERROR'
    };
    res.status(500).json(response);
  }
});

/**
 * POST /aid/v1/complete-job
 * Mark job as completed with results
 * Requires DID authorization
 */
router.post('/v1/complete-job', validateEncoderDID, async (req: Request, res: Response) => {
  try {
    const { job_id, result } = req.body as AidCompleteJobRequest;

    if (!job_id || !result) {
      const response: AidCompleteJobResponse = {
        success: false,
        error: 'Missing required fields: job_id, result',
        code: AidErrorCode.INVALID_REQUEST
      };
      return res.status(400).json(response);
    }

    // Validate result structure
    if (!result.cid) {
      const response: AidCompleteJobResponse = {
        success: false,
        error: 'Result must include cid',
        code: AidErrorCode.INVALID_CID
      };
      return res.status(400).json(response);
    }

    const encoderDid = req.encoder!.encoder_id;
    const mongoConnector = MongoDBConnector.getInstance();
    
    const completed = await mongoConnector.completeJobForAid(
      job_id,
      encoderDid,
      result
    );

    if (!completed) {
      const response: AidCompleteJobResponse = {
        success: false,
        error: 'Job not found or not assigned to this encoder',
        code: AidErrorCode.JOB_NOT_FOUND
      };
      return res.status(404).json(response);
    }

    const response: AidCompleteJobResponse = {
      success: true,
      job_id,
      completed_at: new Date(),
      message: 'Job completed successfully via Gateway Aid Service'
    };

    logger.info(`Job ${job_id} completed by ${encoderDid} via Aid system`);
    res.json(response);
  } catch (error) {
    logger.error('Failed to complete job for Aid', error);
    const response: AidCompleteJobResponse = {
      success: false,
      error: 'Failed to complete job',
      code: 'INTERNAL_ERROR'
    };
    res.status(500).json(response);
  }
});

export default router;
