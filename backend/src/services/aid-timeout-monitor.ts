import { MongoDBConnector } from './mongodb';
import { DiscordWebhookService } from './discord-webhook';
import { logger } from '../utils/logger';

/**
 * Gateway Aid Timeout Monitor Service
 * 
 * Monitors jobs claimed via Aid system and automatically releases them
 * back to pending if they haven't been pinged for > 1 hour.
 * 
 * This prevents jobs from being stuck in "assigned" state if an encoder
 * crashes or loses connection.
 */
export class AidTimeoutMonitor {
  private static instance: AidTimeoutMonitor | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes
  private isRunning = false;
  private hasAlertedFallbackActivation = false;

  private mongoConnector: MongoDBConnector;
  private discordService: DiscordWebhookService;

  private constructor() {
    this.mongoConnector = MongoDBConnector.getInstance();
    this.discordService = new DiscordWebhookService();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): AidTimeoutMonitor {
    if (!AidTimeoutMonitor.instance) {
      AidTimeoutMonitor.instance = new AidTimeoutMonitor();
    }
    return AidTimeoutMonitor.instance;
  }

  /**
   * Start the timeout monitor
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Aid timeout monitor is already running');
      return;
    }

    logger.info('Starting Gateway Aid timeout monitor (checking every 5 minutes)');
    this.isRunning = true;

    // Run immediately on start
    this.checkTimeouts();

    // Then run periodically
    this.intervalId = setInterval(() => {
      this.checkTimeouts();
    }, this.CHECK_INTERVAL);
  }

  /**
   * Stop the timeout monitor
   */
  stop(): void {
    if (!this.isRunning) {
      logger.warn('Aid timeout monitor is not running');
      return;
    }

    logger.info('Stopping Gateway Aid timeout monitor');
    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Check for timed-out Aid jobs and release them
   */
  private async checkTimeouts(): Promise<void> {
    try {
      logger.debug('Checking for timed-out Aid jobs...');

      const releasedCount = await this.mongoConnector.releaseTimedOutAidJobs();

      if (releasedCount > 0) {
        logger.warn(`Released ${releasedCount} timed-out Aid job(s) back to pending`);
        
        // Send Discord notification about timeout releases
        await this.sendTimeoutAlert(releasedCount);
      } else {
        logger.debug('No timed-out Aid jobs found');
      }
    } catch (error) {
      logger.error('Failed to check Aid job timeouts', error);
    }
  }

  /**
   * Check if this is the first Aid-serviced job and send activation alert
   */
  async checkAndAlertFallbackActivation(): Promise<void> {
    try {
      // Only check once per monitor lifecycle
      if (this.hasAlertedFallbackActivation) {
        return;
      }

      const isFirst = await this.mongoConnector.isFirstAidServicedJob();
      
      if (isFirst) {
        this.hasAlertedFallbackActivation = true;
        await this.sendFallbackActivationAlert();
      }
    } catch (error) {
      logger.error('Failed to check/alert fallback activation', error);
    }
  }

  /**
   * Send Discord alert when Gateway Aid fallback system is first activated
   */
  private async sendFallbackActivationAlert(): Promise<void> {
    try {
      await this.discordService.sendCustomAlert({
        title: '🚨 GATEWAY AID FALLBACK ACTIVATED',
        description: 'The Gateway Aid fallback system has been activated! An encoder is now claiming jobs through the makeshift gateway.',
        color: 0xff9800, // Orange color for warning
        fields: [
          {
            name: 'Status',
            value: 'Legacy gateway appears to be down or unreachable',
            inline: true
          },
          {
            name: 'Action',
            value: 'Encoders will continue working via Aid system',
            inline: true
          },
          {
            name: 'Recommendation',
            value: 'Check legacy gateway service and restore normal operation when possible'
          }
        ],
        timestamp: new Date()
      });

      logger.warn('🚨 Gateway Aid fallback activation alert sent to Discord');
    } catch (error) {
      logger.error('Failed to send fallback activation alert to Discord', error);
    }
  }

  /**
   * Send Discord alert when jobs are released due to timeout
   */
  private async sendTimeoutAlert(count: number): Promise<void> {
    try {
      await this.discordService.sendCustomAlert({
        title: '⏱️ Aid Job Timeout Release',
        description: `${count} job${count > 1 ? 's' : ''} ${count > 1 ? 'were' : 'was'} automatically released back to pending due to timeout (no ping for > 1 hour)`,
        color: 0xffc107, // Amber color for timeout warning
        fields: [
          {
            name: 'Released Jobs',
            value: count.toString(),
            inline: true
          },
          {
            name: 'Reason',
            value: 'No heartbeat for > 60 minutes',
            inline: true
          },
          {
            name: 'Status',
            value: 'Jobs are now available for claiming again'
          }
        ],
        timestamp: new Date()
      });

      logger.info(`Timeout alert sent to Discord for ${count} job(s)`);
    } catch (error) {
      logger.error('Failed to send timeout alert to Discord', error);
    }
  }

  /**
   * Get monitor status
   */
  getStatus(): { isRunning: boolean; checkInterval: number; hasAlerted: boolean } {
    return {
      isRunning: this.isRunning,
      checkInterval: this.CHECK_INTERVAL,
      hasAlerted: this.hasAlertedFallbackActivation
    };
  }
}
