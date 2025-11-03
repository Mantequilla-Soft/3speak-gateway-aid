import { MongoClient, Db, Collection } from 'mongodb';
import { logger } from '../utils/logger';
import { Job, ActiveJob, DatabaseError } from '../types/index';

export class MongoDBConnector {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private connected: boolean = false;
  private connectionString: string = '';
  private static instance: MongoDBConnector | null = null;

  constructor() {
    // Use the imported logger
  }

  /**
   * Get singleton instance
   */
  static getInstance(): MongoDBConnector {
    if (!MongoDBConnector.instance) {
      MongoDBConnector.instance = new MongoDBConnector();
    }
    return MongoDBConnector.instance;
  }

  /**
   * Connect to MongoDB database
   */
  async connect(connectionUri: string, databaseName?: string): Promise<void> {
    try {
      // If no database name provided, try to extract from URI or use default
      const dbName = databaseName || 'spk-encoder-gateway';
      
      // Construct full connection string
      let fullConnectionString = connectionUri;
      if (!connectionUri.endsWith('/')) {
        fullConnectionString += '/';
      }
      fullConnectionString += dbName;
      
      this.connectionString = fullConnectionString;
      this.client = new MongoClient(connectionUri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 10000, // Increased timeout
        socketTimeoutMS: 45000,
      });

      await this.client.connect();
      this.db = this.client.db(dbName);
      this.connected = true;
      
      logger.info(`Successfully connected to MongoDB database: ${dbName}`);
    } catch (error) {
      logger.error('Failed to connect to MongoDB', error);
      // Don't throw error, allow graceful degradation
      this.client = null;
      this.db = null;
      this.connected = false;
    }
  }

  /**
   * Disconnect from MongoDB
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.connected = false;
      this.db = null;
      logger.info('Disconnected from MongoDB');
    }
  }

  /**
   * Get the jobs collection
   */
  private getJobsCollection(): Collection | null {
    if (!this.db || !this.connected) {
      return null;
    }
    return this.db.collection('jobs');
  }

  /**
   * Get jobs that are currently being processed (status: "running")
   */
  async getActiveJobs(): Promise<Job[]> {
    try {
      if (!this.client || !this.connected) {
        logger.warn('MongoDB not connected, using demo data for getActiveJobs');
        return this.getDemoActiveJobs();
      }

      if (!this.db) {
        logger.warn('Database not available, using demo data for getActiveJobs');
        return this.getDemoActiveJobs();
      }

      const collection = this.db.collection('jobs');
      const jobs = await collection
        .find({ status: "running" })
        .sort({ created_at: -1 })
        .limit(10)
        .toArray();
      
      return jobs as unknown as Job[];
    } catch (error) {
      logger.error('Error fetching active jobs, using demo data:', error);
      return this.getDemoActiveJobs();
    }
  }

  /**
   * Get available jobs (status: "unassigned") sorted by latest
   */
  async getAvailableJobs(): Promise<Job[]> {
    try {
      if (!this.client || !this.connected) {
        logger.warn('MongoDB not connected, using demo data for getAvailableJobs');
        return [];
      }

      if (!this.db) {
        logger.warn('Database not available, using demo data for getAvailableJobs');
        return [];
      }

      const collection = this.db.collection('jobs');
      const jobs = await collection
        .find({ status: "unassigned" })
        .sort({ created_at: -1 })
        .limit(10)
        .toArray();
      
      return jobs as unknown as Job[];
    } catch (error) {
      logger.error('Error fetching available jobs:', error);
      return [];
    }
  }

  /**
   * Get jobs completed today (since 00:00 UTC)
   */
  async getJobsCompletedToday(): Promise<Job[]> {
    try {
      if (!this.client || !this.connected) {
        logger.warn('MongoDB not connected, using demo data for getJobsCompletedToday');
        return this.getDemoCompletedJobs().filter(job => 
          job.completed_at && 
          job.completed_at.toDateString() === new Date().toDateString()
        );
      }

      if (!this.db) {
        logger.warn('Database not available, using demo data for getJobsCompletedToday');
        return [];
      }

      // Get start of day in UTC
      const startOfToday = new Date();
      startOfToday.setUTCHours(0, 0, 0, 0);

      const collection = this.db.collection('jobs');
      const jobs = await collection
        .find({ 
          status: "complete",
          completed_at: { $gte: startOfToday }
        })
        .sort({ completed_at: -1 })
        .toArray();
      
      return jobs as unknown as Job[];
    } catch (error) {
      logger.error('Error fetching jobs completed today:', error);
      return [];
    }
  }

  /**
   * Get recent jobs (last 10) for dashboard
   */
  async getRecentJobs(): Promise<Job[]> {
    try {
      if (!this.client || !this.connected) {
        logger.warn('MongoDB not connected, using demo data for getRecentJobs');
        return [...this.getDemoActiveJobs(), ...this.getDemoCompletedJobs()]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 10);
      }

      if (!this.db) {
        logger.warn('Database not available, using demo data for getRecentJobs');
        return [];
      }

      const collection = this.db.collection('jobs');
      const jobs = await collection
        .find({})
        .sort({ created_at: -1 })
        .limit(10)
        .toArray();
      
      return jobs as unknown as Job[];
    } catch (error) {
      logger.error('Error fetching recent jobs:', error);
      return [];
    }
  }

  /**
   * Get active encoders count from recent jobs
   */
  async getActiveEncodersCount(): Promise<number> {
    try {
      if (!this.client || !this.connected) {
        logger.warn('MongoDB not connected, using demo data for getActiveEncodersCount');
        return 2; // Demo data has 2 encoders
      }

      if (!this.db) {
        logger.warn('Database not available, using demo data for getActiveEncodersCount');
        return 0;
      }

      const collection = this.db.collection('jobs');
      
      // Get latest 10 jobs and count unique assigned_to values
      const jobs = await collection
        .find({ assigned_to: { $exists: true, $ne: null } })
        .sort({ created_at: -1 })
        .limit(10)
        .toArray();
      
      const uniqueEncoders = new Set(jobs.map(job => job.assigned_to));
      return uniqueEncoders.size;
    } catch (error) {
      logger.error('Error fetching active encoders count:', error);
      return 0;
    }
  }

  /**
   * Get recently completed jobs
   */
  async getCompletedJobs(limit: number = 20, offset: number = 0): Promise<Job[]> {
    try {
      if (!this.client || !this.connected || !this.db) {
        logger.warn('MongoDB not connected, using demo data for getCompletedJobs');
        return this.getDemoCompletedJobs().slice(offset, offset + limit);
      }

      const collection = this.db.collection('jobs');
      const jobs = await collection
        .find({ status: 'complete' })
        .sort({ completed_at: -1 })
        .skip(offset)
        .limit(limit)
        .toArray();

      return jobs.map((job: any) => ({
        ...job,
        id: job._id?.toString() || job.id
      }));
    } catch (error) {
      logger.error('Error fetching completed jobs, using demo data:', error);
      return this.getDemoCompletedJobs().slice(0, limit);
    }
  }

  /**
   * Get last N completed jobs for gateway health check
   */
  async getLastCompletedJobs(limit: number = 10): Promise<any[]> {
    try {
      if (!this.client || !this.connected || !this.db) {
        logger.warn('MongoDB not connected, cannot check gateway health');
        return [];
      }

      const collection = this.db.collection('jobs');
      const jobs = await collection
        .find({ status: 'complete', completed_at: { $exists: true } })
        .sort({ completed_at: -1 })
        .limit(limit)
        .toArray();

      return jobs;
    } catch (error) {
      logger.error('Error fetching last completed jobs:', error);
      return [];
    }
  }

  /**
   * Get a specific job by ID
   */
  async getJobById(jobId: string): Promise<Job | null> {
    try {
      const collection = this.getJobsCollection();
      if (!collection) {
        // Demo mode - search in demo data
        const allJobs = [...this.getDemoActiveJobs(), ...this.getDemoCompletedJobs()];
        return allJobs.find(job => job.id === jobId || job._id === jobId) || null;
      }

      const job = await collection.findOne({ 
        $or: [
          { _id: jobId as any },
          { id: jobId }
        ]
      });

      if (!job) {
        return null;
      }

      return {
        _id: job._id?.toString(),
        id: job.id,
        status: job.status,
        created_at: new Date(job.created_at),
        start_date: job.start_date ? new Date(job.start_date) : undefined,
        last_pinged: job.last_pinged ? new Date(job.last_pinged) : undefined,
        completed_at: job.completed_at ? new Date(job.completed_at) : undefined,
        assigned_to: job.assigned_to,
        assigned_date: job.assigned_date ? new Date(job.assigned_date) : undefined,
        metadata: job.metadata || { video_owner: '', video_permlink: '' },
        storageMetadata: job.storageMetadata || { app: '', key: '', type: '' },
        input: job.input || { uri: '', size: 0 },
        result: job.result,
        last_pinged_diff: job.last_pinged_diff ? new Date(job.last_pinged_diff) : undefined,
        // Legacy compatibility fields
        owner: job.metadata?.video_owner || job.owner,
        permlink: job.metadata?.video_permlink || job.permlink,
        encoder_id: job.assigned_to || job.encoder_id,
        input_uri: job.input?.uri || job.input_uri,
        input_size: job.input?.size || job.input_size,
        progress: job.progress,
        current_codec: job.current_codec,
        current_quality: job.current_quality,
        ipfs_cid: job.result?.ipfs_cid || job.ipfs_cid,
        error_message: job.error_message,
        encoding_time: job.encoding_time
      };
    } catch (error) {
      logger.error(`Error fetching job ${jobId} from MongoDB`, error);
      throw new DatabaseError('Failed to fetch job', error as Error);
    }
  }

  /**
   * Get daily statistics for jobs
   */
  async getDailyStatistics(days: number = 30): Promise<any[]> {
    try {
      const collection = this.getJobsCollection();
      if (!collection) {
        // Demo mode - return demo daily statistics
        logger.warn('MongoDB not connected, using demo daily statistics');
        return [
          {
            _id: new Date().toISOString().split('T')[0],
            completed: 2,
            failed: 0,
            total_encoding_time: 9000,
            average_encoding_time: 4500
          }
        ];
      }
      
      const pipeline = [
        {
          $match: {
            status: 'complete', // Match actual status value from gateway
            completed_at: {
              $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000)
            }
          }
        },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: "%Y-%m-%d", date: "$completed_at" } },
              encoder_id: "$assigned_to",
              quality: "$current_quality"
            },
            count: { $sum: 1 },
            total_encoding_time: { $sum: "$encoding_time" },
            avg_encoding_time: { $avg: "$encoding_time" }
          }
        },
        {
          $group: {
            _id: "$_id.date",
            videos_encoded: { $sum: "$count" },
            by_encoder: {
              $push: {
                encoder_id: "$_id.encoder_id",
                count: "$count"
              }
            },
            by_quality: {
              $push: {
                quality: "$_id.quality",
                count: "$count"
              }
            },
            total_encoding_time: { $sum: "$total_encoding_time" },
            average_encoding_time: { $avg: "$avg_encoding_time" }
          }
        },
        {
          $sort: { _id: -1 }
        }
      ];

      const results = await collection.aggregate(pipeline).toArray();
      return results;
    } catch (error) {
      logger.error('Error fetching daily statistics from MongoDB', error);
      throw new DatabaseError('Failed to fetch daily statistics', error as Error);
    }
  }

  /**
   * Get encoder performance metrics
   */
  async getEncoderPerformance(encoderId?: string): Promise<any[]> {
    try {
      const collection = this.getJobsCollection();
      if (!collection) {
        // Demo mode - return demo encoder performance
        logger.warn('MongoDB not connected, using demo encoder performance');
        return [
          {
            _id: 'did:key:z6MkdemoEncoder1',
            total_jobs: 1,
            total_encoding_time: 3600,
            average_encoding_time: 3600,
            success_rate: 100
          },
          {
            _id: 'did:key:z6MkdemoEncoder2',
            total_jobs: 1,
            total_encoding_time: 5400,
            average_encoding_time: 5400,
            success_rate: 100
          }
        ].filter(encoder => !encoderId || encoder._id === encoderId);
      }
      
      const matchStage: any = {
        status: 'complete', // Match actual status value from gateway
        assigned_to: { $exists: true, $ne: null },
        completed_at: {
          $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
        }
      };

      if (encoderId) {
        matchStage.assigned_to = encoderId;
      }

      const pipeline = [
        { $match: matchStage },
        {
          $group: {
            _id: "$assigned_to",
            jobs_completed: { $sum: 1 },
            total_encoding_time: { $sum: "$encoding_time" },
            average_encoding_time: { $avg: "$encoding_time" },
            success_rate: {
              $avg: {
                $cond: [{ $eq: ["$status", "complete"] }, 1, 0]
              }
            }
          }
        },
        {
          $sort: { jobs_completed: -1 }
        }
      ];

      const results = await collection.aggregate(pipeline).toArray();
      return results;
    } catch (error) {
      logger.error('Error fetching encoder performance from MongoDB', error);
      throw new DatabaseError('Failed to fetch encoder performance', error as Error);
    }
  }

  /**
   * Get encoder info from cluster_nodes collection
   */
  async getEncoderFromCluster(didKey: string) {
    try {
      if (!this.client || !this.connected || !this.db) {
        logger.warn('MongoDB not connected, cannot fetch encoder info');
        return null;
      }

      const nodesCollection = this.db.collection('cluster_nodes');
      const encoder = await nodesCollection.findOne({ id: didKey });
      
      if (encoder) {
        return {
          didKey: encoder.id,
          nodeName: encoder.name,
          hiveAccount: encoder.cryptoAccounts?.hive,
          peerId: encoder.peer_id,
          commitHash: encoder.commit_hash,
          banned: encoder.banned || false,
          firstSeen: encoder.first_seen,
          lastSeen: encoder.last_seen
        };
      }
      
      return null;
    } catch (error) {
      logger.error('Error getting encoder from cluster:', error);
      return null;
    }
  }

  /**
   * Health check for MongoDB connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.db) {
        return false;
      }
      
      await this.db.admin().ping();
      return true;
    } catch (error) {
      logger.warn('MongoDB health check failed', error);
      return false;
    }
  }

  /**
   * Demo data for when MongoDB is not available
   */
  private getDemoActiveJobs(): ActiveJob[] {
    return [
      {
        _id: 'demo_1',
        id: 'demo-job-1',
        status: 'running',
        created_at: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
        assigned_to: 'did:key:z6MkdemoEncoder1',
        assigned_date: new Date(Date.now() - 1000 * 60 * 25),
        start_time: new Date(Date.now() - 1000 * 60 * 25),
        estimated_completion: new Date(Date.now() + 1000 * 60 * 10), // 10 minutes from now
        metadata: {
          video_owner: 'demo_user_1',
          video_permlink: 'my-awesome-video'
        },
        storageMetadata: {
          app: '3speak',
          key: 'demo_user_1/my-awesome-video/video',
          type: 'video'
        },
        input: {
          uri: 'https://ipfs.3speak.tv/ipfs/QmDemo123...',
          size: 52428800 // 50MB
        },
        progress: 75,
        current_codec: 'h264',
        current_quality: '1080p',
        owner: 'demo_user_1',
        permlink: 'my-awesome-video',
        encoder_id: 'did:key:z6MkdemoEncoder1',
        input_uri: 'https://ipfs.3speak.tv/ipfs/QmDemo123...',
        input_size: 52428800
      },
      {
        _id: 'demo_2',
        id: 'demo-job-2',
        status: 'assigned',
        created_at: new Date(Date.now() - 1000 * 60 * 10), // 10 minutes ago
        assigned_to: 'did:key:z6MkdemoEncoder2',
        assigned_date: new Date(Date.now() - 1000 * 60 * 5),
        start_time: new Date(Date.now() - 1000 * 60 * 5),
        estimated_completion: new Date(Date.now() + 1000 * 60 * 20),
        metadata: {
          video_owner: 'content_creator',
          video_permlink: 'blockchain-tutorial'
        },
        storageMetadata: {
          app: '3speak',
          key: 'content_creator/blockchain-tutorial/video',
          type: 'video'
        },
        input: {
          uri: 'https://ipfs.3speak.tv/ipfs/QmDemo456...',
          size: 104857600 // 100MB
        },
        progress: 25,
        current_codec: 'h264',
        current_quality: '720p',
        owner: 'content_creator',
        permlink: 'blockchain-tutorial',
        encoder_id: 'did:key:z6MkdemoEncoder2',
        input_uri: 'https://ipfs.3speak.tv/ipfs/QmDemo456...',
        input_size: 104857600
      }
    ];
  }

  private getDemoCompletedJobs(): Job[] {
    return [
      {
        _id: 'demo_completed_1',
        id: 'demo-completed-1',
        status: 'complete' as any, // Match actual status value
        created_at: new Date(Date.now() - 1000 * 60 * 120), // 2 hours ago
        completed_at: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
        assigned_to: 'did:key:z6MkdemoEncoder1',
        metadata: {
          video_owner: 'crypto_enthusiast',
          video_permlink: 'defi-explained'
        },
        storageMetadata: {
          app: '3speak',
          key: 'crypto_enthusiast/defi-explained/video',
          type: 'video'
        },
        input: {
          uri: 'https://ipfs.3speak.tv/ipfs/QmCompleted1...',
          size: 78643200 // 75MB
        },
        result: {
          ipfs_cid: 'QmResultHash123...',
          output_size: 45678900
        },
        encoding_time: 3600, // 1 hour
        owner: 'crypto_enthusiast',
        permlink: 'defi-explained',
        encoder_id: 'did:key:z6MkdemoEncoder1'
      },
      {
        _id: 'demo_completed_2',
        id: 'demo-completed-2',
        status: 'complete' as any, // Match actual status value
        created_at: new Date(Date.now() - 1000 * 60 * 180), // 3 hours ago
        completed_at: new Date(Date.now() - 1000 * 60 * 90), // 1.5 hours ago
        assigned_to: 'did:key:z6MkdemoEncoder2',
        metadata: {
          video_owner: 'tech_reviewer',
          video_permlink: 'latest-smartphone-review'
        },
        storageMetadata: {
          app: '3speak',
          key: 'tech_reviewer/latest-smartphone-review/video',
          type: 'video'
        },
        input: {
          uri: 'https://ipfs.3speak.tv/ipfs/QmCompleted2...',
          size: 125829120 // 120MB
        },
        result: {
          ipfs_cid: 'QmResultHash456...',
          output_size: 67890123
        },
        encoding_time: 5400, // 1.5 hours
        owner: 'tech_reviewer',
        permlink: 'latest-smartphone-review',
        encoder_id: 'did:key:z6MkdemoEncoder2'
      }
    ];
  }
}