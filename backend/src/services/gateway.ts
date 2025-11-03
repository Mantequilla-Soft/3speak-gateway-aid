import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from '../utils/logger';
import { Job, JobStatus, GatewayAPIError } from '../types/index';
import { config } from '../config/index';
import { GatewayHealthMonitor, GatewayHealthStatus } from './gateway-health';

export class GatewayMonitor {
  private axiosInstance: AxiosInstance;
  private baseUrl: string;
  private healthMonitor: GatewayHealthMonitor;
  private lastHealthStatus: GatewayHealthStatus | null = null;

  constructor() {
    this.baseUrl = config.gateway.baseUrl;
    
    // Initialize health monitor with DID key from environment
    const didKey = process.env.GATEWAY_MONITOR_DID_KEY || 'did:key:fallback';
    const privateKey = process.env.GATEWAY_MONITOR_PRIVATE_KEY || 'mock_key';
    
    this.healthMonitor = new GatewayHealthMonitor(this.baseUrl, didKey, privateKey);
    
    if (didKey === 'did:key:fallback') {
      logger.warn('⚠️ No DID key configured - using basic monitoring only');
    } else {
      logger.info('🔧 Gateway health monitor initialized with DID key');
    }
    
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'User-Agent': 'GatewayMonitor/1.0',
        'Content-Type': 'application/json'
      }
    });

    // Add response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        this.handleApiError(error);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Handle API errors with proper logging and error transformation
   */
  private handleApiError(error: AxiosError): void {
    const { response, request, message } = error;
    
    if (response) {
      // Server responded with error status
      logger.warn('Gateway API error response', {
        status: response.status,
        statusText: response.statusText,
        url: response.config?.url,
        data: response.data
      });
    } else if (request) {
      // Request was made but no response received
      logger.error('Gateway API no response', {
        url: request.url,
        message: message
      });
    } else {
      // Error in request setup
      logger.error('Gateway API request setup error', {
        message: message
      });
    }
  }

  /**
   * Get available jobs from the gateway queue
   * Returns empty array if no jobs available (404 response)
   */
  async getAvailableJobs(): Promise<Job[]> {
    try {
      logger.debug('Polling gateway for available jobs');
      
      const response = await this.axiosInstance.get('/gateway/getJob');
      
      if (response.data) {
        const jobData = response.data;
        
        // Transform gateway response to our Job interface
        const job: Job = {
          id: jobData.id || jobData._id,
          status: 'pending',
          created_at: new Date(jobData.created_at || jobData.createdAt || Date.now()),
          metadata: {
            video_owner: jobData.owner || jobData.metadata?.video_owner || '',
            video_permlink: jobData.permlink || jobData.metadata?.video_permlink || ''
          },
          storageMetadata: jobData.storageMetadata || { app: '', key: '', type: '' },
          input: {
            uri: jobData.input_uri || jobData.inputUri || jobData.input?.uri || '',
            size: jobData.input_size || jobData.inputSize || jobData.input?.size || 0
          },
          // Legacy compatibility fields
          owner: jobData.owner || jobData.metadata?.video_owner,
          permlink: jobData.permlink || jobData.metadata?.video_permlink,
          input_uri: jobData.input_uri || jobData.inputUri,
          input_size: jobData.input_size || jobData.inputSize,
          current_codec: jobData.codec || 'h264',
          current_quality: jobData.quality || '720p'
        };
        
        logger.info('Available job found', { 
          jobId: job.id, 
          owner: job.owner, 
          permlink: job.permlink 
        });
        
        return [job];
      }
      
      return [];
      
    } catch (error) {
      const axiosError = error as AxiosError;
      
      // Gateway returns 404 when no jobs are available
      if (axiosError.response?.status === 404) {
        logger.debug('No jobs available in gateway queue');
        return [];
      }
      
      // For other errors, log and throw
      logger.error('Error fetching available jobs from gateway', error);
      throw new GatewayAPIError(
        'Failed to fetch available jobs from gateway',
        axiosError.response?.status || 500,
        error as Error
      );
    }
  }

  /**
   * Get status of a specific job from the gateway
   */
  async getJobStatus(jobId: string): Promise<JobStatus | null> {
    try {
      logger.debug(`Getting job status for ${jobId}`);
      
      const response = await this.axiosInstance.get(`/gateway/jobstatus/${jobId}`);
      
      if (response.data) {
        const statusData = response.data;
        
        return {
          job_id: jobId,
          status: statusData.status,
          progress: statusData.progress || 0,
          encoder_id: statusData.encoder_id || statusData.encoderId,
          error: statusData.error,
          metadata: statusData.metadata || {}
        };
      }
      
      return null;
      
    } catch (error) {
      const axiosError = error as AxiosError;
      
      if (axiosError.response?.status === 404) {
        logger.debug(`Job ${jobId} not found in gateway`);
        return null;
      }
      
      logger.error(`Error fetching job status for ${jobId}`, error);
      throw new GatewayAPIError(
        `Failed to fetch job status for ${jobId}`,
        axiosError.response?.status || 500,
        error as Error
      );
    }
  }

  /**
   * Get multiple job statuses in batch
   */
  async getBatchJobStatus(jobIds: string[]): Promise<Map<string, JobStatus>> {
    const statusMap = new Map<string, JobStatus>();
    
    // Process jobs in parallel with concurrency limit
    const concurrencyLimit = 5;
    const batches: string[][] = [];
    
    for (let i = 0; i < jobIds.length; i += concurrencyLimit) {
      batches.push(jobIds.slice(i, i + concurrencyLimit));
    }
    
    for (const batch of batches) {
      const promises = batch.map(async (jobId) => {
        try {
          const status = await this.getJobStatus(jobId);
          if (status) {
            statusMap.set(jobId, status);
          }
        } catch (error) {
          logger.warn(`Failed to get status for job ${jobId}`, error);
        }
      });
      
      await Promise.allSettled(promises);
    }
    
    logger.info(`Retrieved status for ${statusMap.size}/${jobIds.length} jobs`);
    return statusMap;
  }

  /**
   * Health check for gateway API using the dedicated health monitor
   */
  async healthCheck(): Promise<boolean> {
    try {
      const healthStatus = await this.healthMonitor.checkHealth();
      this.lastHealthStatus = healthStatus;
      return healthStatus.isOnline;
    } catch (error) {
      logger.warn('Gateway health check failed', error);
      return false;
    }
  }

  /**
   * Get detailed health status
   */
  async getDetailedHealthStatus(): Promise<GatewayHealthStatus> {
    const healthStatus = await this.healthMonitor.checkHealth();
    this.lastHealthStatus = healthStatus;
    return healthStatus;
  }

  /**
   * Get last known health status without performing new check
   */
  getLastHealthStatus(): GatewayHealthStatus | null {
    return this.lastHealthStatus;
  }

  /**
   * Perform comprehensive gateway test including DID key authentication
   */
  async performComprehensiveHealthCheck(): Promise<{
    health: GatewayHealthStatus;
    registration: boolean;
    jobPolling: boolean;
  }> {
    const result = await this.healthMonitor.performComprehensiveCheck();
    this.lastHealthStatus = result.health;
    return result;
  }

  /**
   * Test DID key authentication by attempting to register as monitor
   */
  async testAuthentication(): Promise<boolean> {
    return await this.healthMonitor.registerAsMonitor();
  }

  /**
   * Get gateway statistics and metadata
   */
  async getGatewayInfo(): Promise<any> {
    try {
      const response = await this.axiosInstance.get('/gateway/info');
      return response.data;
    } catch (error) {
      logger.error('Error fetching gateway info', error);
      throw new GatewayAPIError(
        'Failed to fetch gateway info',
        (error as AxiosError).response?.status || 500,
        error as Error
      );
    }
  }

  /**
   * Update the base URL for the gateway API
   */
  updateBaseUrl(newBaseUrl: string): void {
    this.baseUrl = newBaseUrl;
    this.axiosInstance.defaults.baseURL = newBaseUrl;
    logger.info(`Gateway base URL updated to ${newBaseUrl}`);
  }
}