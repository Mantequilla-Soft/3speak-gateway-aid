import { MongoClient, Db, Collection } from 'mongodb';
import { logger } from '../utils/logger';
import { Job, ActiveJob, DatabaseError } from '../types/index';

export class MongoDBConnector {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private threespeakDb: Db | null = null;
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
      this.threespeakDb = this.client.db('threespeak');
      this.connected = true;
      
      logger.info(`Successfully connected to MongoDB database: ${dbName}`);
      logger.info(`Successfully connected to threespeak database for video healing`);
    } catch (error) {
      logger.error('Failed to connect to MongoDB', error);
      // Don't throw error, allow graceful degradation
      this.client = null;
      this.db = null;
      this.threespeakDb = null;
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
      this.threespeakDb = null;
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
            videos_encoded: 2,
            completed: 2,
            failed: 0,
            total_encoding_time: 9000,
            average_encoding_time: 4500,
            success_rate: 1.0
          }
        ];
      }
      
      const pipeline = [
        {
          $match: {
            status: { $in: ['completed', 'complete', 'failed'] }, // Include both completed and failed
            $or: [
              { completed_at: { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) } },
              { 
                status: 'failed',
                last_pinged: { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) }
              }
            ]
          }
        },
        {
          $addFields: {
            // Calculate encoding time from assigned_date to completed_at (when encoder was actually working)
            calculated_encoding_time: {
              $cond: [
                { $and: [
                  { $ne: ["$assigned_date", null] },
                  { $ne: ["$completed_at", null] }
                ]},
                { $divide: [
                  { $subtract: ["$completed_at", "$assigned_date"] },
                  1000 // Convert milliseconds to seconds
                ]},
                0
              ]
            }
          }
        },
        {
          $group: {
            _id: {
              date: { 
                $dateToString: { 
                  format: "%Y-%m-%d", 
                  date: { 
                    $ifNull: ["$completed_at", "$last_pinged"] 
                  } 
                } 
              },
              encoder_id: "$assigned_to",
              quality: "$current_quality",
              status: "$status"
            },
            count: { $sum: 1 },
            total_encoding_time: { $sum: "$calculated_encoding_time" },
            avg_encoding_time: { $avg: "$calculated_encoding_time" }
          }
        },
        {
          $group: {
            _id: "$_id.date",
            videos_encoded: { $sum: "$count" },
            completed: {
              $sum: {
                $cond: [
                  { $in: ["$_id.status", ["completed", "complete"]] },
                  "$count",
                  0
                ]
              }
            },
            failed: {
              $sum: {
                $cond: [
                  { $eq: ["$_id.status", "failed"] },
                  "$count",
                  0
                ]
              }
            },
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
          $addFields: {
            success_rate: {
              $cond: [
                { $gt: ["$videos_encoded", 0] },
                { $divide: ["$completed", "$videos_encoded"] },
                0
              ]
            }
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
        status: { $in: ['completed', 'complete', 'failed'] }, // Include both completed and failed
        assigned_to: { $exists: true, $ne: null },
        $or: [
          { completed_at: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
          { 
            status: 'failed',
            last_pinged: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
          }
        ]
      };

      if (encoderId) {
        matchStage.assigned_to = encoderId;
      }

      const pipeline = [
        { $match: matchStage },
        {
          $group: {
            _id: "$assigned_to",
            jobs_completed: { 
              $sum: {
                $cond: [
                  { $in: ["$status", ["completed", "complete"]] },
                  1,
                  0
                ]
              }
            },
            jobs_failed: {
              $sum: {
                $cond: [
                  { $eq: ["$status", "failed"] },
                  1,
                  0
                ]
              }
            },
            total_jobs: { $sum: 1 },
            total_encoding_time: { $sum: { $ifNull: ["$encoding_time", 0] } },
            average_encoding_time: { $avg: { $ifNull: ["$encoding_time", 0] } },
            success_rate: {
              $avg: {
                $cond: [
                  { $in: ["$status", ["completed", "complete"]] }, 
                  1, 
                  0
                ]
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

  // ============================================================
  // Gateway Aid Fallback System Methods
  // ============================================================

  /**
   * List available jobs for Aid system (pending jobs only)
   */
  async listAvailableJobsForAid(): Promise<Job[]> {
    try {
      if (!this.client || !this.connected || !this.db) {
        logger.warn('MongoDB not connected for Aid listAvailableJobs');
        return [];
      }

      const collection = this.db.collection('jobs');
      const jobs = await collection
        .find({ 
          status: 'pending',
          assigned_to: { $exists: false }
        })
        .sort({ created_at: 1 }) // Oldest first (FIFO)
        .toArray();

      return jobs.map(job => this.mapJobDocument(job));
    } catch (error) {
      logger.error('Failed to list available jobs for Aid', error);
      throw new DatabaseError('Failed to list available jobs', error as Error);
    }
  }

  /**
   * Atomically claim a job for Aid system
   * Uses findOneAndUpdate for atomic operation to prevent double-assignment
   */
  async claimJobForAid(jobId: string, encoderDid: string): Promise<Job | null> {
    try {
      if (!this.client || !this.connected || !this.db) {
        logger.warn('MongoDB not connected for Aid claimJob');
        return null;
      }

      const collection = this.db.collection('jobs');
      
      // Atomic operation: find pending job and assign it in one operation
      const result = await collection.findOneAndUpdate(
        { 
          id: jobId,
          status: 'pending',
          assigned_to: { $exists: false }
        },
        { 
          $set: { 
            status: 'assigned',
            assigned_to: encoderDid,
            assigned_date: new Date(),
            serviced_by_aid: true, // Flag to track Aid-serviced jobs
            aid_claimed_at: new Date()
          }
        },
        { 
          returnDocument: 'after' // Return the updated document
        }
      );

      if (!result) {
        logger.warn(`Job ${jobId} not available for claiming (already assigned or doesn't exist)`);
        return null;
      }

      logger.info(`Job ${jobId} claimed by ${encoderDid} via Aid system`);
      return this.mapJobDocument(result);
    } catch (error) {
      logger.error(`Failed to claim job ${jobId} for Aid`, error);
      throw new DatabaseError('Failed to claim job', error as Error);
    }
  }

  /**
   * Get job details for Aid system (including ownership verification)
   */
  async getJobForAid(jobId: string, encoderDid: string): Promise<Job | null> {
    try {
      if (!this.client || !this.connected || !this.db) {
        logger.warn('MongoDB not connected for Aid getJob');
        return null;
      }

      const collection = this.db.collection('jobs');
      const jobDoc = await collection.findOne({ id: jobId });

      if (!jobDoc) {
        logger.warn(`Job ${jobId} not found`);
        return null;
      }

      logger.debug(`Job ${jobId} retrieved for ${encoderDid} (owned: ${jobDoc.assigned_to === encoderDid})`);
      return this.mapJobDocument(jobDoc);
    } catch (error) {
      logger.error(`Failed to get job ${jobId} for Aid`, error);
      throw new DatabaseError('Failed to get job', error as Error);
    }
  }

  /**
   * Update job progress for Aid system
   */
  async updateJobProgressForAid(
    jobId: string, 
    encoderDid: string,
    status: 'assigned' | 'running' | 'failed',
    progress: { download_pct: number; pct: number }
  ): Promise<boolean> {
    try {
      if (!this.client || !this.connected || !this.db) {
        logger.warn('MongoDB not connected for Aid updateJobProgress');
        return false;
      }

      const collection = this.db.collection('jobs');
      
      const updateFields: any = {
        status,
        progress,
        last_pinged: new Date()
      };

      const result = await collection.updateOne(
        { 
          id: jobId,
          assigned_to: encoderDid,
          serviced_by_aid: true // Only update Aid-serviced jobs
        },
        { $set: updateFields }
      );

      if (result.matchedCount === 0) {
        logger.warn(`Job ${jobId} not found or not assigned to ${encoderDid}`);
        return false;
      }

      logger.debug(`Job ${jobId} progress updated: ${progress.pct}%`);
      return true;
    } catch (error) {
      logger.error(`Failed to update job ${jobId} progress for Aid`, error);
      throw new DatabaseError('Failed to update job progress', error as Error);
    }
  }

  /**
   * Complete a job for Aid system
   */
  async completeJobForAid(
    jobId: string,
    encoderDid: string,
    result: any
  ): Promise<boolean> {
    try {
      if (!this.client || !this.connected || !this.db) {
        logger.warn('MongoDB not connected for Aid completeJob');
        return false;
      }

      const collection = this.db.collection('jobs');
      
      const updateResult = await collection.updateOne(
        { 
          id: jobId,
          assigned_to: encoderDid,
          serviced_by_aid: true // Only complete Aid-serviced jobs
        },
        { 
          $set: { 
            status: 'completed',
            completed_at: new Date(),
            result,
            progress: 100
          }
        }
      );

      if (updateResult.matchedCount === 0) {
        logger.warn(`Job ${jobId} not found or not assigned to ${encoderDid}`);
        return false;
      }

      logger.info(`Job ${jobId} completed by ${encoderDid} via Aid system`);
      return true;
    } catch (error) {
      logger.error(`Failed to complete job ${jobId} for Aid`, error);
      throw new DatabaseError('Failed to complete job', error as Error);
    }
  }

  /**
   * Release timed-out Aid jobs (jobs assigned via Aid but not pinged for > 1 hour)
   */
  async releaseTimedOutAidJobs(): Promise<number> {
    try {
      if (!this.client || !this.connected || !this.db) {
        logger.warn('MongoDB not connected for Aid releaseTimedOutJobs');
        return 0;
      }

      const collection = this.db.collection('jobs');
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const result = await collection.updateMany(
        {
          serviced_by_aid: true,
          status: { $in: ['assigned', 'running'] },
          $or: [
            { last_pinged: { $lt: oneHourAgo } },
            { 
              last_pinged: { $exists: false },
              aid_claimed_at: { $lt: oneHourAgo }
            }
          ]
        },
        {
          $set: {
            status: 'pending',
            progress: 0
          },
          $unset: {
            assigned_to: '',
            assigned_date: '',
            serviced_by_aid: '',
            aid_claimed_at: '',
            last_pinged: ''
          }
        }
      );

      if (result.modifiedCount > 0) {
        logger.info(`Released ${result.modifiedCount} timed-out Aid jobs back to pending`);
      }

      return result.modifiedCount;
    } catch (error) {
      logger.error('Failed to release timed-out Aid jobs', error);
      throw new DatabaseError('Failed to release timed-out jobs', error as Error);
    }
  }

  /**
   * Check if this is the first job serviced by Aid (for Discord alert)
   */
  async isFirstAidServicedJob(): Promise<boolean> {
    try {
      if (!this.client || !this.connected || !this.db) {
        return false;
      }

      const collection = this.db.collection('jobs');
      const count = await collection.countDocuments({ serviced_by_aid: true });
      
      return count === 1; // True if this is the first Aid-serviced job
    } catch (error) {
      logger.error('Failed to check first Aid job', error);
      return false;
    }
  }

  /**
   * Get the last activity timestamp for a specific encoder
   * Looks at recent jobs to find when the encoder was last active
   */
  async getEncoderLastActivity(encoderDid: string): Promise<Date | null> {
    try {
      if (!this.client || !this.connected || !this.db) {
        return null;
      }

      const collection = this.db.collection('jobs');
      
      // Find the most recent job assigned to this encoder
      const recentJob = await collection
        .find({ assigned_to: encoderDid })
        .sort({ 
          completed_at: -1,  // Prefer completed jobs first
          last_pinged: -1,   // Then by last ping
          assigned_date: -1  // Then by assignment date
        })
        .limit(1)
        .toArray();

      if (recentJob.length === 0) {
        return null; // Encoder has no job history
      }

      const job = recentJob[0];
      
      // Return the most recent timestamp we have for this encoder's activity
      return job.completed_at || job.last_pinged || job.assigned_date || job.created_at;
    } catch (error) {
      logger.error(`Failed to get last activity for encoder ${encoderDid}`, error);
      return null;
    }
  }

  /**
   * Get embed jobs (direct encoding) with video metadata
   * @param limit Number of jobs to return (default 30)
   */
  async getEmbedJobs(limit: number = 30) {
    try {
      if (!this.client) {
        throw new Error('Not connected to MongoDB');
      }

      const threespeakDb = this.client.db('threespeak');
      const embedJobsCollection = threespeakDb.collection('embed-jobs');
      const embedVideoCollection = threespeakDb.collection('embed-video');

      // Get last N jobs, sorted by creation date descending
      const jobs = await embedJobsCollection
        .find({})
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();

      // Enrich with video metadata
      const enrichedJobs = await Promise.all(
        jobs.map(async (job) => {
          const video = await embedVideoCollection.findOne({
            owner: job.owner,
            permlink: job.permlink
          });

          return {
            ...job,
            _id: job._id?.toString(),
            video: video ? {
              ...video,
              _id: video._id?.toString()
            } : null
          };
        })
      );

      return enrichedJobs;
    } catch (error) {
      logger.error('Failed to fetch embed jobs', error);
      throw error;
    }
  }

  /**
   * Get embed job statistics
   */
  async getEmbedJobStats() {
    try {
      if (!this.client) {
        throw new Error('Not connected to MongoDB');
      }

      const threespeakDb = this.client.db('threespeak');
      const embedJobsCollection = threespeakDb.collection('embed-jobs');

      // Get today's date at midnight
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [
        totalToday,
        completedToday,
        failedToday,
        encoderDistribution,
        avgEncodingTime
      ] = await Promise.all([
        // Total jobs today
        embedJobsCollection.countDocuments({
          createdAt: { $gte: today }
        }),

        // Completed jobs today
        embedJobsCollection.countDocuments({
          createdAt: { $gte: today },
          status: 'completed'
        }),

        // Failed jobs today
        embedJobsCollection.countDocuments({
          createdAt: { $gte: today },
          status: 'failed'
        }),

        // Jobs per encoder
        embedJobsCollection.aggregate([
          {
            $group: {
              _id: '$assignedWorker',
              count: { $sum: 1 }
            }
          },
          {
            $sort: { count: -1 }
          }
        ]).toArray(),

        // Average encoding time (for completed jobs)
        embedJobsCollection.aggregate([
          {
            $match: {
              status: 'completed',
              assignedAt: { $exists: true },
              webhookReceivedAt: { $exists: true }
            }
          },
          {
            $project: {
              duration: {
                $subtract: ['$webhookReceivedAt', '$assignedAt']
              }
            }
          },
          {
            $group: {
              _id: null,
              avgDuration: { $avg: '$duration' }
            }
          }
        ]).toArray()
      ]);

      return {
        totalToday,
        completedToday,
        failedToday,
        encoderDistribution: encoderDistribution.map(e => ({
          encoder: e._id,
          count: e.count
        })),
        avgEncodingTimeMs: avgEncodingTime[0]?.avgDuration || 0
      };
    } catch (error) {
      logger.error('Failed to fetch embed job stats', error);
      throw error;
    }
  }

  /**
   * Map MongoDB document to Job interface
   */
  private mapJobDocument(doc: any): Job {
    return {
      _id: doc._id?.toString(),
      id: doc.id,
      status: doc.status,
      created_at: doc.created_at,
      start_date: doc.start_date,
      last_pinged: doc.last_pinged,
      completed_at: doc.completed_at,
      assigned_to: doc.assigned_to,
      assigned_date: doc.assigned_date,
      metadata: doc.metadata,
      storageMetadata: doc.storageMetadata,
      input: doc.input,
      result: doc.result,
      owner: doc.owner,
      permlink: doc.permlink,
      encoder_id: doc.encoder_id,
      input_uri: doc.input_uri,
      input_size: doc.input_size,
      progress: doc.progress,
      estimated_completion: doc.estimated_completion,
      current_codec: doc.current_codec,
      current_quality: doc.current_quality,
      ipfs_cid: doc.ipfs_cid,
      error_message: doc.error_message,
      encoding_time: doc.encoding_time
    };
  }

  /**
   * ==========================================
   * THREESPEAK DATABASE - VIDEO HEALING METHODS
   * ==========================================
   */

  /**
   * Update video entry in threespeak database with the encoded result
   * Sets status to "published" and adds video_v2 field
   * CRITICAL SAFETY: Only updates videos created in last 24 hours to avoid touching legacy S3 videos
   */
  async updateVideoEntry(
    owner: string,
    permlink: string,
    cid: string
  ): Promise<boolean> {
    try {
      if (!this.client || !this.connected || !this.threespeakDb) {
        logger.warn('MongoDB threespeak database not connected for updateVideoEntry');
        return false;
      }

      const videosCollection = this.threespeakDb.collection('videos');
      const video_v2 = `ipfs://${cid}/manifest.m3u8`;
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const updateResult = await videosCollection.updateOne(
        { 
          owner,
          permlink,
          created: { $gte: oneDayAgo } // SAFETY: Only videos created in last 24 hours
        },
        { 
          $set: { 
            status: 'published',
            video_v2
          }
        }
      );

      if (updateResult.matchedCount === 0) {
        logger.warn(`Video entry not found for ${owner}/${permlink}`);
        return false;
      }

      if (updateResult.modifiedCount === 0) {
        logger.info(`Video entry ${owner}/${permlink} already up to date`);
        return true;
      }

      logger.info(`Updated video entry ${owner}/${permlink} with video_v2: ${video_v2}`);
      return true;
    } catch (error) {
      logger.error(`Failed to update video entry ${owner}/${permlink}`, error);
      return false;
    }
  }

  /**
   * Get recently completed jobs (last N hours) for healer verification
   */
  async getRecentlyCompletedJobs(hoursBack: number = 1): Promise<Job[]> {
    try {
      if (!this.client || !this.connected || !this.db) {
        logger.warn('MongoDB not connected for getRecentlyCompletedJobs');
        return [];
      }

      const collection = this.db.collection('jobs');
      const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

      const jobs = await collection
        .find({
          status: 'complete',
          completed_at: { $gte: cutoffTime },
          'result.cid': { $exists: true } // Only jobs with results
        })
        .sort({ completed_at: -1 })
        .toArray();

      return jobs as unknown as Job[];
    } catch (error) {
      logger.error('Error fetching recently completed jobs', error);
      return [];
    }
  }

  /**
   * Check if video entry needs healing (published but missing video_v2)
   * CRITICAL SAFETY: Only heals videos created in last 24 hours to avoid touching legacy S3 videos
   */
  async checkVideoNeedsHealing(owner: string, permlink: string): Promise<boolean> {
    try {
      if (!this.client || !this.connected || !this.threespeakDb) {
        logger.warn('MongoDB threespeak database not connected for checkVideoNeedsHealing');
        return false;
      }

      const videosCollection = this.threespeakDb.collection('videos');
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const video = await videosCollection.findOne({
        owner,
        permlink,
        status: 'published',
        created: { $gte: oneDayAgo }, // SAFETY: Only videos created in last 24 hours
        $or: [
          { video_v2: { $exists: false } },
          { video_v2: null },
          { video_v2: '' }
        ]
      });

      return video !== null;
    } catch (error) {
      logger.error(`Error checking if video ${owner}/${permlink} needs healing`, error);
      return false;
    }
  }

  /**
   * Get video entry for debugging/testing
   */
  async getVideoEntry(owner: string, permlink: string): Promise<any | null> {
    try {
      if (!this.client || !this.connected || !this.threespeakDb) {
        logger.warn('MongoDB threespeak database not connected for getVideoEntry');
        return null;
      }

      const videosCollection = this.threespeakDb.collection('videos');
      const video = await videosCollection.findOne({ owner, permlink });
      
      return video;
    } catch (error) {
      logger.error(`Error getting video entry ${owner}/${permlink}`, error);
      return null;
    }
  }
}
