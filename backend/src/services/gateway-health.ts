import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';

export interface GatewayHealthStatus {
  isOnline: boolean;
  responseTime: number;
  lastCheck: Date;
  stats?: any;
  error?: string;
  statusCode?: number;
}

export interface NodeInfo {
  encoder_id: string;
  name: string;
  description: string;
  location?: string;
  hardware_type?: string;
  version: string;
}

export class GatewayHealthMonitor {
  private apiUrl: string;
  private client: AxiosInstance;
  private didKey: string;
  private privateKey: string;
  private lastHealthStatus: GatewayHealthStatus;

  constructor(apiUrl: string, didKey: string, privateKey: string) {
    this.apiUrl = apiUrl;
    this.didKey = didKey;
    this.privateKey = privateKey;

    this.client = axios.create({
      baseURL: this.apiUrl,
      timeout: 30000, // 30 second timeout
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': '3Speak-Gateway-Monitor/1.0.0'
      },
      maxRedirects: 3,
      maxContentLength: 50 * 1024 * 1024, // 50MB max response size
      maxBodyLength: 50 * 1024 * 1024,    // 50MB max request size
    });

    // Initialize with offline status
    this.lastHealthStatus = {
      isOnline: false,
      responseTime: 0,
      lastCheck: new Date(),
      error: 'Not checked yet'
    };

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        // Clean up large error response data
        if (error.response && error.response.data) {
          if (typeof error.response.data === 'object' && 
              JSON.stringify(error.response.data).length > 1000) {
            error.response.data = '[Large response data removed]';
          }
        }
        throw error;
      }
    );
  }

  /**
   * Simple GET wrapper with retries for network issues
   */
  private async getWithRetries<T = any>(path: string, maxRetries: number = 2): Promise<T> {
    const baseDelay = 1000; // 1 second base delay

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.client.get<T>(path);
        return response.data;
      } catch (err: any) {
        const isLast = attempt === maxRetries;
        const shouldRetry = !err.response || 
          (err.response && err.response.status >= 500) || 
          err.code === 'ECONNABORTED' || 
          err.code === 'ENOTFOUND' || 
          err.code === 'ECONNREFUSED';

        if (!shouldRetry || isLast) throw err;

        const delay = baseDelay * Math.pow(2, attempt - 1);
        logger.warn(`Gateway health check GET ${path} failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms: ${err.message}`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
    throw new Error('Unreachable');
  }

  /**
   * Create a JWS token following the same pattern as the encoder client
   * This mimics the encoder's authentication but identifies as a monitor
   */
  private async createJWS(payload: any): Promise<string> {
    // Following the exact pattern from the encoder client
    const header = { 
      alg: 'EdDSA', 
      typ: 'JWT',
      kid: this.didKey
    };
    
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    
    // In a real implementation, this would use the private key to sign
    // For monitoring purposes, we use a deterministic signature
    const signature = Buffer.from(`monitor_signature_${this.didKey.slice(-8)}_${Date.now()}`).toString('base64url');
    
    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  /**
   * Check if gateway is responding to basic requests
   */
  async checkHealth(): Promise<GatewayHealthStatus> {
    const startTime = Date.now();
    
    try {
      logger.debug('🔍 Checking gateway health...');
      
      // Try to get gateway stats endpoint (matching encoder client pattern)
      const stats = await this.getWithRetries('/gateway/stats', 2);
      
      const responseTime = Date.now() - startTime;
      
      this.lastHealthStatus = {
        isOnline: true,
        responseTime,
        lastCheck: new Date(),
        stats,
        statusCode: 200
      };
      
      logger.info(`✅ Gateway is online - Response time: ${responseTime}ms`);
      return this.lastHealthStatus;
      
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      let errorMessage = 'Unknown error';
      let statusCode: number | undefined;
      
      if (axios.isAxiosError(error)) {
        statusCode = error.response?.status;
        errorMessage = error.response?.data?.message || error.message;
        
        if (error.code === 'ECONNREFUSED') {
          errorMessage = 'Connection refused - Gateway may be down';
        } else if (error.code === 'ENOTFOUND') {
          errorMessage = 'DNS resolution failed - Check gateway URL';
        } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
          errorMessage = 'Request timeout - Gateway may be overloaded';
        }
      } else {
        errorMessage = error.message || 'Network error';
      }
      
      this.lastHealthStatus = {
        isOnline: false,
        responseTime,
        lastCheck: new Date(),
        error: errorMessage,
        statusCode
      };
      
      logger.warn(`❌ Gateway health check failed: ${errorMessage} (${responseTime}ms)`);
      return this.lastHealthStatus;
    }
  }

  /**
   * Attempt to register as a monitoring node (optional test)
   */
  async registerAsMonitor(): Promise<boolean> {
    try {
      const nodeInfo: NodeInfo = {
        encoder_id: this.didKey,
        name: 'Gateway Monitor',
        description: 'Health monitoring and status checking service',
        location: 'Monitoring Service',
        hardware_type: 'virtual',
        version: '1.0.0'
      };
      
      const jws = await this.createJWS({ node_info: nodeInfo });
      
      await this.client.post('/gateway/updateNode', { jws });
      
      logger.info('📡 Successfully registered as monitoring node');
      return true;
      
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const message = error.response?.data?.message || error.message;
        logger.warn(`⚠️ Monitor registration failed [${status}]: ${message}`);
      } else {
        logger.warn('⚠️ Monitor registration failed:', error.message);
      }
      return false;
    }
  }

  /**
   * Test if we can poll for jobs (should return empty/no jobs for monitor)
   */
  async testJobPolling(): Promise<boolean> {
    try {
      await this.client.get('/gateway/getJob', { timeout: 10000 });
      logger.debug('📋 Job polling endpoint accessible');
      return true;
    } catch (error: any) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        // 404 is expected - no jobs for our monitor node
        logger.debug('📋 Job polling working (no jobs available as expected)');
        return true;
      }
      
      logger.warn('⚠️ Job polling test failed:', error.message);
      return false;
    }
  }

  /**
   * Get the last health status without performing a new check
   */
  getLastHealthStatus(): GatewayHealthStatus {
    return this.lastHealthStatus;
  }

  /**
   * Get detailed gateway statistics if available
   */
  async getGatewayStats(): Promise<any> {
    try {
      return await this.getWithRetries('/gateway/stats');
    } catch (error) {
      logger.debug('❌ Failed to get gateway stats:', error);
      return null;
    }
  }

  /**
   * Perform comprehensive gateway health check
   */
  async performComprehensiveCheck(): Promise<{
    health: GatewayHealthStatus;
    registration: boolean;
    jobPolling: boolean;
  }> {
    logger.info('🔍 Starting comprehensive gateway health check...');
    
    // Basic health check
    const health = await this.checkHealth();
    
    if (!health.isOnline) {
      return {
        health,
        registration: false,
        jobPolling: false
      };
    }

    // Test registration (optional)
    const registration = await this.registerAsMonitor();
    
    // Test job polling
    const jobPolling = await this.testJobPolling();
    
    logger.info(`✅ Comprehensive check complete - Health: ${health.isOnline}, Registration: ${registration}, Job Polling: ${jobPolling}`);
    
    return {
      health,
      registration,
      jobPolling
    };
  }
}