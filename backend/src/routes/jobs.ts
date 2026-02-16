import { Router } from 'express';
import { MongoDBConnector } from '../services/mongodb';
import { GatewayMonitor } from '../services/gateway';
import { SQLiteManager } from '../services/sqlite';
import { EncoderLookupService } from '../services/encoder-lookup';
import { logger } from '../utils/logger';
import { ApiResponse, PaginatedResponse, Job } from '../types/index';

const router = Router();

// Services will be initialized lazily to avoid startup issues
let mongodb: MongoDBConnector;
let sqliteManager: SQLiteManager;
let encoderLookup: EncoderLookupService;
let gatewayMonitor: GatewayMonitor | null = null;

const getServices = () => {
  if (!mongodb) {
    mongodb = MongoDBConnector.getInstance();
    sqliteManager = SQLiteManager.getInstance();
    encoderLookup = new EncoderLookupService(mongodb, sqliteManager);
  }
  return { mongodb, sqliteManager, encoderLookup };
};

const getGatewayMonitor = () => {
  if (!gatewayMonitor) {
    gatewayMonitor = new GatewayMonitor();
  }
  return gatewayMonitor;
};

/**
 * GET /api/jobs/available
 * Get jobs available in the gateway queue (status: "unassigned")
 */
router.get('/available', async (req, res) => {
  try {
    const { mongodb } = getServices();
    const availableJobs = await mongodb.getAvailableJobs();
    
    const response: ApiResponse<Job[]> = {
      success: true,
      data: availableJobs
    };

    res.json(response);
  } catch (error) {
    logger.error('Error fetching available jobs', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to fetch available jobs'
    };
    res.status(500).json(response);
  }
});

/**
 * GET /api/jobs/active
 * Get jobs currently being processed
 */
router.get('/active', async (req, res) => {
  try {
    const { mongodb, encoderLookup } = getServices();
    const activeJobs = await mongodb.getActiveJobs();
    
    // Get unique encoder DIDs
    const encoderDids = [...new Set(activeJobs
      .map(job => job.assigned_to || job.encoder_id)
      .filter((did): did is string => Boolean(did))
    )];
    
    // Fetch encoder information
    const encoderInfoMap = await encoderLookup.getMultipleEncoderInfos(encoderDids);
    
    // Add encoder info to jobs
    const jobsWithEncoders = activeJobs.map(job => {
      const encoderDid = job.assigned_to || job.encoder_id;
      const encoderInfo = encoderDid ? encoderInfoMap.get(encoderDid) : null;
      
      return {
        ...job,
        encoderInfo: encoderInfo ? {
          nodeName: encoderInfo.nodeName,
          hiveAccount: encoderInfo.hiveAccount,
          didKey: encoderInfo.didKey
        } : null
      };
    });
    
    const response: ApiResponse<any[]> = {
      success: true,
      data: jobsWithEncoders
    };

    res.json(response);
  } catch (error) {
    logger.error('Error fetching active jobs', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to fetch active jobs'
    };
    res.status(500).json(response);
  }
});

/**
 * GET /api/jobs/completed
 * Get recently completed jobs with pagination
 */
router.get('/completed', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = (page - 1) * limit;

    const { mongodb, encoderLookup } = getServices();
    const completedJobs = await mongodb.getCompletedJobs(limit, offset);
    
    // Calculate durations for each completed job
    const jobsWithDurations = completedJobs.map(job => {
      let totalDuration = 0;
      let encodingDuration = 0;
      
      if (job.completed_at && job.created_at) {
        const completedTime = new Date(job.completed_at).getTime();
        const createdTime = new Date(job.created_at).getTime();
        totalDuration = Math.max(0, Math.floor((completedTime - createdTime) / 1000)); // in seconds
      }
      
      if (job.completed_at && job.assigned_date) {
        const completedTime = new Date(job.completed_at).getTime();
        const assignedTime = new Date(job.assigned_date).getTime();
        encodingDuration = Math.max(0, Math.floor((completedTime - assignedTime) / 1000)); // in seconds
      }
      
      return {
        ...job,
        totalDuration, // Total time from creation to completion (seconds)
        encodingDuration // Time from assignment to completion (seconds)
      };
    });
    
    // Get unique encoder DIDs
    const encoderDids = [...new Set(jobsWithDurations
      .map(job => job.assigned_to || job.encoder_id)
      .filter((did): did is string => Boolean(did))
    )];
    
    // Fetch encoder information
    const encoderInfoMap = await encoderLookup.getMultipleEncoderInfos(encoderDids);
    
    // Add encoder info to jobs
    const jobsWithEncoders = jobsWithDurations.map(job => {
      const encoderDid = job.assigned_to || job.encoder_id;
      const encoderInfo = encoderDid ? encoderInfoMap.get(encoderDid) : null;
      
      return {
        ...job,
        encoderInfo: encoderInfo ? {
          nodeName: encoderInfo.nodeName,
          hiveAccount: encoderInfo.hiveAccount,
          didKey: encoderInfo.didKey
        } : null
      };
    });
    
    // Get total count for proper pagination
    const total = await mongodb.getCompletedJobsCount();
    const pages = Math.ceil(total / limit);

    const response: PaginatedResponse<any> = {
      success: true,
      data: jobsWithEncoders,
      pagination: {
        page,
        limit,
        total,
        pages
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Error fetching completed jobs', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to fetch completed jobs'
    };
    res.status(500).json(response);
  }
});

/**
 * GET /api/jobs/:id
 * Get details for a specific job
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Try to get from MongoDB first
    const { mongodb } = getServices();
    let job = await mongodb.getJobById(id);
    
    // If not found in MongoDB, try to get status from gateway
    if (!job) {
      const jobStatus = await getGatewayMonitor().getJobStatus(id);
      if (jobStatus) {
        // Convert job status to job object (minimal info)
        job = {
          id: jobStatus.job_id,
          status: jobStatus.status as any,
          created_at: new Date(),
          metadata: { video_owner: '', video_permlink: '' },
          storageMetadata: { app: '', key: '', type: '' },
          input: { uri: '', size: 0 },
          assigned_to: jobStatus.encoder_id,
          progress: jobStatus.progress,
          owner: '',
          permlink: ''
        };
      }
    }

    if (!job) {
      const response: ApiResponse = {
        success: false,
        error: 'Job not found'
      };
      return res.status(404).json(response);
    }

    // If job is active, try to get real-time status
    if (job.status === 'assigned' || job.status === 'running') {
      try {
        const liveStatus = await getGatewayMonitor().getJobStatus(id);
        if (liveStatus) {
          job.progress = liveStatus.progress;
          job.encoder_id = liveStatus.encoder_id || job.encoder_id;
        }
      } catch (error) {
        // Live status fetch failed, use stored data
        logger.warn(`Failed to get live status for job ${id}`, error);
      }
    }

    const response: ApiResponse<Job> = {
      success: true,
      data: job
    };

    res.json(response);
  } catch (error) {
    logger.error(`Error fetching job ${req.params.id}`, error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to fetch job details'
    };
    res.status(500).json(response);
  }
});

/**
 * GET /api/jobs/:id/status
 * Get real-time status for a specific job from gateway
 */
router.get('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const jobStatus = await getGatewayMonitor().getJobStatus(id);
    
    if (!jobStatus) {
      const response: ApiResponse = {
        success: false,
        error: 'Job status not found'
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse = {
      success: true,
      data: jobStatus
    };

    res.json(response);
  } catch (error) {
    logger.error(`Error fetching job status ${req.params.id}`, error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to fetch job status'
    };
    res.status(500).json(response);
  }
});

/**
 * POST /api/jobs/batch-status
 * Get status for multiple jobs at once
 */
router.post('/batch-status', async (req, res) => {
  try {
    const { jobIds } = req.body;
    
    if (!Array.isArray(jobIds)) {
      const response: ApiResponse = {
        success: false,
        error: 'jobIds must be an array'
      };
      return res.status(400).json(response);
    }

    if (jobIds.length > 50) {
      const response: ApiResponse = {
        success: false,
        error: 'Maximum 50 jobs per batch request'
      };
      return res.status(400).json(response);
    }

    const statusMap = await getGatewayMonitor().getBatchJobStatus(jobIds);
    
    // Convert Map to object for JSON serialization
    const statusObject = Object.fromEntries(statusMap);

    const response: ApiResponse = {
      success: true,
      data: statusObject
    };

    res.json(response);
  } catch (error) {
    logger.error('Error fetching batch job status', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to fetch batch job status'
    };
    res.status(500).json(response);
  }
});

export default router;