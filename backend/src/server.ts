import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import dotenv from 'dotenv';

import { logger } from './utils/logger';
import { config } from './config/index';
import { MongoDBConnector } from './services/mongodb';
import { GatewayMonitor } from './services/gateway';
import { SQLiteManager } from './services/sqlite';
import { WebSocketManager } from './services/websocket';
import { AidTimeoutMonitor } from './services/aid-timeout-monitor';

// Routes
import jobsRouter from './routes/jobs';
import encodersRouter from './routes/encoders';
import statisticsRouter from './routes/statistics';
import aidRouter from './routes/aid';
import directEncodingRouter from './routes/direct-encoding';

// Load environment variables
dotenv.config();

class GatewayMonitorServer {
  private app: express.Application;
  private server: ReturnType<typeof createServer>;
  private wsServer: WebSocketServer;
  private wsManager!: WebSocketManager;
  
  // Services
  private mongodb!: MongoDBConnector;
  private gatewayMonitor!: GatewayMonitor;
  private sqliteManager!: SQLiteManager;
  private aidTimeoutMonitor!: AidTimeoutMonitor;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.wsServer = new WebSocketServer({ server: this.server });
    
    this.initializeServices();
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeWebSocket();
    this.initializeErrorHandling();
  }

  private initializeServices(): void {
    this.mongodb = MongoDBConnector.getInstance();
    this.gatewayMonitor = new GatewayMonitor();
    this.sqliteManager = SQLiteManager.getInstance(config.sqlite.path);
    this.wsManager = new WebSocketManager(this.wsServer);
    this.aidTimeoutMonitor = AidTimeoutMonitor.getInstance();
  }

  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(helmet());
    
    // CORS configuration
    this.app.use(cors({
      origin: config.cors.origins,
      credentials: true
    }));
    
    // Compression and parsing
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Logging middleware
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next();
    });
  }

  private initializeRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0'
      });
    });

    // API routes
    this.app.use('/api/jobs', jobsRouter);
    this.app.use('/api/encoders', encodersRouter);
    this.app.use('/api/statistics', statisticsRouter);
    this.app.use('/aid', aidRouter); // Gateway Aid Fallback System routes
    this.app.use('/api/direct-encoding', directEncodingRouter);

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({ error: 'Route not found' });
    });
  }

  private initializeWebSocket(): void {
    this.wsManager.initialize();
    logger.info('WebSocket server initialized');
  }

  private initializeErrorHandling(): void {
    // Global error handler
    this.app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Unhandled error', err);
      res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });
  }

  public async start(): Promise<void> {
    try {
      // Start server immediately - don't block on database connections
      const port = config.port;
      this.server.listen(port, () => {
        logger.info(`🚀 Gateway Monitor Server running on port ${port}`);
        logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      });

      // Initialize databases in background (non-blocking)
      this.initializeDatabasesAsync();

      // Start Gateway Aid timeout monitor
      this.aidTimeoutMonitor.start();
      logger.info('✅ Gateway Aid timeout monitor started');

    } catch (error) {
      logger.error('Failed to start server', error);
      process.exit(1);
    }
  }

  private async initializeDatabasesAsync(): Promise<void> {
    // Initialize SQLite first (fast, local)
    try {
      await this.sqliteManager.initialize();
      logger.info('✅ SQLite database initialized');
    } catch (error) {
      logger.error('SQLite initialization failed', error);
    }

    // Try MongoDB with timeout, but don't block server startup
    try {
      logger.info('Attempting MongoDB connection...');
      await Promise.race([
        this.mongodb.connect(config.mongodb.connectionString, config.mongodb.database),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('MongoDB connection timeout')), 5000)
        )
      ]);
      logger.info('✅ Connected to MongoDB');
    } catch (error) {
      logger.warn('⚠️  MongoDB connection failed - running without MongoDB', error);
    }
  }

  private startMonitoringServices(): void {
    // Temporarily disable monitoring services to debug startup issues
    logger.info('Monitoring services temporarily disabled for debugging');
    
    // TODO: Re-enable after fixing startup issues
    /*
    // Gateway job polling disabled - focus on health monitoring only
    // The legacy gateway doesn't provide a reliable jobs API for monitoring
    logger.info('Gateway job polling disabled - using health monitoring only');

    // Start active jobs monitoring
    setInterval(async () => {
      try {
        const jobs = await this.mongodb.getActiveJobs();
        // Convert Jobs to ActiveJobs format
        const activeJobs = jobs
          .filter(job => job.status === 'assigned' || job.status === 'running')
          .map(job => ({
            ...job,
            encoder_id: job.assigned_to || job.encoder_id || 'unknown',
            progress: job.progress || 0,
            start_time: job.start_date || job.created_at,
            estimated_completion: job.estimated_completion || new Date(Date.now() + 3600000), // 1 hour estimate
            current_codec: job.current_codec || 'h264',
            current_quality: job.current_quality || '720p'
          }));
        this.wsManager.broadcast('jobs:active', activeJobs);
      } catch (error) {
        logger.error('Error fetching active jobs', error);
      }
    }, config.monitoring.activeJobsPollInterval);

    // Start gateway health monitoring
    setInterval(async () => {
      try {
        const healthStatus = await this.gatewayMonitor.getDetailedHealthStatus();
        
        // Broadcast gateway health status
        this.wsManager.broadcast('gateway:health', {
          isOnline: healthStatus.isOnline,
          responseTime: healthStatus.responseTime,
          lastCheck: healthStatus.lastCheck,
          error: healthStatus.error,
          stats: healthStatus.stats
        });
        
        if (healthStatus.isOnline) {
          logger.debug(`🟢 Gateway online - ${healthStatus.responseTime}ms response`);
        } else {
          logger.warn(`🔴 Gateway offline - ${healthStatus.error}`);
        }
      } catch (error) {
        logger.error('Error checking gateway health', error);
      }
    }, 15000); // Check every 15 seconds

    logger.info('Monitoring services started (including gateway health)');
    */
  }

  public async stop(): Promise<void> {
    logger.info('Shutting down server...');
    
    // Close WebSocket connections
    this.wsServer.close();
    
    // Close database connections
    await this.mongodb.disconnect();
    await this.sqliteManager.close();
    
    // Close HTTP server
    this.server.close(() => {
      logger.info('Server stopped');
      process.exit(0);
    });
  }
}

// Handle graceful shutdown
const server = new GatewayMonitorServer();

process.on('SIGTERM', () => server.stop());
process.on('SIGINT', () => server.stop());

// Start the server
server.start().catch((error) => {
  logger.error('Failed to start server', error);
  process.exit(1);
});