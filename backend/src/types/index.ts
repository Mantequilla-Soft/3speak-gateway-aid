// Core data types for the Gateway Monitor system

export interface Job {
  _id?: string;
  id: string;
  status: 'pending' | 'assigned' | 'running' | 'completed' | 'failed';
  created_at: Date;
  start_date?: Date;
  last_pinged?: Date;
  completed_at?: Date;
  assigned_to?: string;
  assigned_date?: Date;
  metadata: {
    video_owner: string;
    video_permlink: string;
  };
  storageMetadata: {
    app: string;
    key: string;
    type: string;
  };
  input: {
    uri: string;
    size: number;
  };
  result?: any;
  last_pinged_diff?: Date;
  // Legacy fields for compatibility
  owner?: string;
  permlink?: string;
  encoder_id?: string;
  input_uri?: string;
  input_size?: number;
  progress?: number;
  estimated_completion?: Date;
  current_codec?: string;
  current_quality?: string;
  ipfs_cid?: string;
  error_message?: string;
  encoding_time?: number;
}

export interface ActiveJob extends Job {
  encoder_id: string;
  progress: number;
  start_time: Date;
  estimated_completion: Date;
  current_codec: string;
  current_quality: string;
}

export interface Encoder {
  encoder_id: string;
  name: string;
  owner: string;
  location?: string;
  hardware_type?: string;
  created_at: Date;
  last_seen?: Date;
  is_active: boolean;
  current_job_id?: string;
  hardware_capabilities?: HardwareCapabilities;
  performance_metrics?: PerformanceMetrics;
}

export interface HardwareCapabilities {
  hardware_encoding: boolean;
  supported_codecs: string[];
  max_resolution: string;
  gpu_info?: string;
}

export interface PerformanceMetrics {
  jobs_completed_today: number;
  average_encoding_time: number;
  success_rate: number;
  last_24h_jobs: number;
}

export interface EncoderStatus {
  encoder_id: string;
  status: 'online' | 'offline' | 'busy' | 'error';
  current_job?: Job;
  last_heartbeat: Date;
  hardware_utilization?: {
    cpu_usage: number;
    memory_usage: number;
    gpu_usage?: number;
  };
}

export interface JobStatus {
  job_id: string;
  status: string;
  progress: number;
  encoder_id?: string;
  error?: string;
  metadata?: Record<string, any>;
}

export interface DailyStatistics {
  date: string;
  videos_encoded: number;
  by_encoder: Record<string, number>;
  by_quality: Record<string, number>;
  average_encoding_time: number;
  success_rate: number;
  total_encoding_time: number;
}

export interface PerformanceAnalytics {
  encoder_efficiency: Record<string, number>;
  hardware_utilization: {
    hardware_encoding: number;
    software_encoding: number;
  };
  queue_performance: {
    average_wait_time: number;
    current_queue_depth: number;
    peak_queue_depth: number;
  };
}

export interface StatisticsUpdate {
  daily_stats: DailyStatistics;
  performance_analytics: PerformanceAnalytics;
  timestamp: Date;
}

// WebSocket event types
export interface WSEvents {
  'jobs:available': Job[];
  'jobs:active': ActiveJob[];
  'encoders:status': EncoderStatus[];
  'statistics:update': StatisticsUpdate;
  'gateway:health': {
    isOnline: boolean;
    responseTime: number;
    lastCheck: Date;
    error?: string;
    stats?: any;
  };
}

// Database schemas
export interface EncoderRecord {
  encoder_id: string;
  name: string;
  owner: string;
  location?: string;
  hardware_type?: string;
  created_at: string;
  last_seen?: string;
  is_active: number; // SQLite boolean as integer
}

export interface EncoderStats {
  id?: number;
  encoder_id: string;
  date: string;
  jobs_completed: number;
  total_encoding_time: number;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// Configuration types
export interface MonitoringConfig {
  gateway_poll_interval: number;
  active_jobs_poll_interval: number;
  statistics_retention_days: number;
}

// Error types
export class GatewayMonitorError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'GatewayMonitorError';
  }
}

export class DatabaseError extends GatewayMonitorError {
  constructor(message: string, public originalError?: Error) {
    super(message, 'DATABASE_ERROR', 500);
    this.name = 'DatabaseError';
  }
}

export class GatewayAPIError extends GatewayMonitorError {
  constructor(message: string, statusCode: number = 500, public originalError?: Error) {
    super(message, 'GATEWAY_API_ERROR', statusCode);
    this.name = 'GatewayAPIError';
  }
}

// Gateway Aid Fallback System Types

export interface AidJobListRequest {
  encoder_did: string;
  limit?: number;
}

export interface AidJobListResponse {
  success: boolean;
  jobs: AidJobSummary[];
  error?: string;
  code?: string;
}

export interface AidJobSummary {
  id: string;
  created_at: Date;
  metadata: {
    video_owner: string;
    video_permlink: string;
  };
  storageMetadata: {
    app: string;
    key: string;
    type: string;
  };
  input: {
    uri: string;
    size: number;
  };
}

export interface AidClaimJobRequest {
  job_id: string;
  encoder_did: string;
}

export interface AidClaimJobResponse {
  success: boolean;
  job_id?: string;
  assigned_to?: string;
  assigned_at?: Date;
  job_details?: AidJobDetails;
  error?: string;
  code?: string;
}

export interface AidJobDetails {
  input: {
    uri: string;
    size: number;
  };
  metadata: {
    video_owner: string;
    video_permlink: string;
  };
  storageMetadata: {
    app: string;
    key: string;
    type: string;
  };
}

export interface AidUpdateJobRequest {
  job_id: string;
  encoder_did: string;
  status: 'assigned' | 'running' | 'failed';
  progress: {
    download_pct: number;
    pct: number;
  };
}

export interface AidUpdateJobResponse {
  success: boolean;
  job_id?: string;
  status?: string;
  updated_at?: Date;
  error?: string;
  code?: string;
}

export interface AidCompleteJobRequest {
  job_id: string;
  encoder_did: string;
  result: {
    cid: string;
  };
}

export interface AidCompleteJobResponse {
  success: boolean;
  job_id?: string;
  completed_at?: Date;
  message?: string;
  error?: string;
  code?: string;
}

export interface AidGetJobRequest {
  job_id: string;
}

export interface AidGetJobResponse {
  success: boolean;
  job?: {
    id: string;
    status: string;
    assigned_to: string | null;
    is_owned_by_requester: boolean;
    created_at: Date;
    assigned_date?: Date;
    progress?: any;
    metadata: {
      video_owner: string;
      video_permlink: string;
    };
    input: {
      uri: string;
      size: number;
    };
  };
  error?: string;
  code?: string;
}

export interface AidHealthResponse {
  status: 'healthy' | 'unhealthy';
  version: string;
  mongodb_connected: boolean;
  timestamp: Date;
}

// Aid Error Codes
export enum AidErrorCode {
  ENCODER_NOT_AUTHORIZED = 'ENCODER_NOT_AUTHORIZED',
  ENCODER_INACTIVE = 'ENCODER_INACTIVE',
  JOB_NOT_FOUND = 'JOB_NOT_FOUND',
  JOB_ALREADY_ASSIGNED = 'JOB_ALREADY_ASSIGNED',
  JOB_ALREADY_COMPLETED = 'JOB_ALREADY_COMPLETED',
  JOB_NOT_OWNED = 'JOB_NOT_OWNED',
  INVALID_CID = 'INVALID_CID',
  INVALID_REQUEST = 'INVALID_REQUEST',
}

export class AidServiceError extends GatewayMonitorError {
  constructor(
    message: string,
    public code: AidErrorCode,
    statusCode: number = 400
  ) {
    super(message, code, statusCode);
    this.name = 'AidServiceError';
  }
}