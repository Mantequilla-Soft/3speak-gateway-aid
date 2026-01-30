import { MongoDBConnector } from './mongodb';
import { DiscordWebhookService } from './discord-webhook';
import { logger } from '../utils/logger';

/**
 * Video Healer Service
 * 
 * Monitors recently completed jobs and ensures corresponding video entries
 * in the threespeak database are properly updated with video_v2 field.
 * 
 * This service acts as a safety net for the Legacy Gateway Encoder which
 * sometimes fails to update video entries after job completion.
 * 
 * Runs every hour and checks jobs completed in the last hour.
 */
export class VideoHealerService {
  private mongodb: MongoDBConnector;
  private discordService: DiscordWebhookService;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private checkIntervalMs: number;
  private hoursToCheck: number;

  constructor(
    checkIntervalMinutes: number = 60, // Run every 60 minutes
    hoursToCheck: number = 1 // Check last 1 hour of jobs
  ) {
    this.mongodb = MongoDBConnector.getInstance();
    this.discordService = new DiscordWebhookService();
    this.checkIntervalMs = checkIntervalMinutes * 60 * 1000;
    this.hoursToCheck = hoursToCheck;
  }

  /**
   * Start the healer service
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Video Healer Service is already running');
      return;
    }

    this.isRunning = true;
    logger.info(`Starting Video Healer Service (checking every ${this.checkIntervalMs / 60000} minutes for jobs in last ${this.hoursToCheck} hour(s))`);

    // Run immediately on startup
    this.runHealingCycle().catch(error => {
      logger.error('Error in initial Video Healer cycle', error);
    });

    // Then run on interval
    this.intervalId = setInterval(() => {
      this.runHealingCycle().catch(error => {
        logger.error('Error in Video Healer cycle', error);
      });
    }, this.checkIntervalMs);
  }

  /**
   * Stop the healer service
   */
  stop(): void {
    if (!this.isRunning) {
      logger.warn('Video Healer Service is not running');
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    logger.info('Video Healer Service stopped');
  }

  /**
   * Run a single healing cycle
   */
  private async runHealingCycle(): Promise<void> {
    try {
      logger.info('Starting Healer cycle...');
      
      // STEP 1: Heal stuck jobs first (jobs with CID but wrong status)
      const { healed: healedJobs, count: jobsHealedCount } = await this.mongodb.healStuckJobs(this.hoursToCheck);
      
      if (jobsHealedCount > 0) {
        logger.info(`✓ Healed ${jobsHealedCount} stuck job(s)`);
        await this.sendJobHealingNotification(jobsHealedCount, healedJobs);
      }
      
      // STEP 2: Get recently completed jobs (including newly healed ones)
      const recentJobs = await this.mongodb.getRecentlyCompletedJobs(this.hoursToCheck);
      
      if (recentJobs.length === 0) {
        logger.info('No recently completed jobs to check');
        return;
      }

      logger.info(`Checking ${recentJobs.length} recently completed jobs for video entry issues`);

      let healedCount = 0;
      let alreadyHealthyCount = 0;
      let errorCount = 0;

      for (const job of recentJobs) {
        try {
          // Extract owner and permlink from job metadata
          const owner = job.metadata?.video_owner;
          const permlink = job.metadata?.video_permlink;
          const cid = job.result?.cid;

          if (!owner || !permlink) {
            logger.debug(`Job ${job.id} missing owner/permlink metadata, skipping`);
            continue;
          }

          if (!cid) {
            logger.warn(`Job ${job.id} missing result CID, skipping`);
            continue;
          }

          // Check if video entry needs healing
          const needsHealing = await this.mongodb.checkVideoNeedsHealing(owner, permlink);

          if (!needsHealing) {
            alreadyHealthyCount++;
            logger.debug(`Video ${owner}/${permlink} is already healthy or too old (>24h)`);
            continue;
          }

          // Video needs healing - update it
          logger.warn(`Found broken video entry: ${owner}/${permlink} (job: ${job.id})`);
          
          const healed = await this.mongodb.updateVideoEntry(owner, permlink, cid);

          if (healed) {
            healedCount++;
            logger.info(`✓ Healed video entry: ${owner}/${permlink} with CID: ${cid}`);

            // Send Discord notification
            await this.sendHealingNotification(owner, permlink, cid, job.id);
          } else {
            errorCount++;
            logger.error(`✗ Failed to heal video entry: ${owner}/${permlink}`);
          }

        } catch (error) {
          errorCount++;
          logger.error(`Error processing job ${job.id} for healing`, error);
        }
      }

      // Log summary
      logger.info(`Healer cycle complete: ${jobsHealedCount} jobs healed, ${healedCount} videos healed, ${alreadyHealthyCount} healthy, ${errorCount} errors out of ${recentJobs.length} jobs`);

      // Send summary to Discord if any videos were healed
      if (healedCount > 0) {
        await this.sendHealingSummary(healedCount, recentJobs.length);
      }

    } catch (error) {
      logger.error('Error in Video Healer cycle', error);
    }
  }

  /**
   * Send Discord notification about a healed video
   */
  private async sendHealingNotification(
    owner: string,
    permlink: string,
    cid: string,
    jobId: string
  ): Promise<void> {
    try {
      const message = {
        embeds: [{
          title: '🔧 SPK Encoder Gateway Entry Fixed',
          description: `Video entry was missing the encoded result and has been automatically healed.`,
          color: 0xffa500, // Orange color
          fields: [
            {
              name: 'Video',
              value: `${owner}/${permlink}`,
              inline: false
            },
            {
              name: 'Job ID',
              value: jobId,
              inline: true
            },
            {
              name: 'CID',
              value: cid,
              inline: true
            },
            {
              name: 'Action Taken',
              value: 'Set status to "published" and added video_v2 field',
              inline: false
            }
          ],
          timestamp: new Date().toISOString()
        }]
      };

      await this.discordService.sendCustomMessage(message);
    } catch (error) {
      logger.error('Failed to send Discord healing notification', error);
    }
  }

  /**
   * Send notification about healed jobs
   */
  private async sendJobHealingNotification(
    count: number,
    healedJobs: any[]
  ): Promise<void> {
    try {
      const jobsList = healedJobs.slice(0, 5).map(job => {
        const owner = job.metadata?.video_owner || 'unknown';
        const permlink = job.metadata?.video_permlink || 'unknown';
        return `${owner}/${permlink} (${job.id.substring(0, 8)}...)`;
      }).join('\n');

      const moreText = healedJobs.length > 5 ? `\n...and ${healedJobs.length - 5} more` : '';

      const message = {
        embeds: [{
          title: '🔧 Stuck Jobs Fixed',
          description: `Found ${count} job(s) with result CID but incomplete status and fixed them.`,
          color: 0xff9900, // Orange color
          fields: [
            {
              name: 'Jobs Fixed',
              value: jobsList + moreText,
              inline: false
            },
            {
              name: 'Action Taken',
              value: 'Set status to "complete" and added completed_at timestamp',
              inline: false
            }
          ],
          timestamp: new Date().toISOString()
        }]
      };

      await this.discordService.sendCustomMessage(message);
    } catch (error) {
      logger.error('Failed to send Discord job healing notification', error);
    }
  }

  /**
   * Send summary of healing cycle to Discord
   */
  private async sendHealingSummary(
    healedCount: number,
    totalChecked: number
  ): Promise<void> {
    try {
      const message = {
        embeds: [{
          title: '📊 Video Healer Summary',
          description: `Completed healing cycle for last ${this.hoursToCheck} hour(s)`,
          color: 0x00ff00, // Green color
          fields: [
            {
              name: 'Videos Healed',
              value: healedCount.toString(),
              inline: true
            },
            {
              name: 'Jobs Checked',
              value: totalChecked.toString(),
              inline: true
            }
          ],
          timestamp: new Date().toISOString()
        }]
      };

      await this.discordService.sendCustomMessage(message);
    } catch (error) {
      logger.error('Failed to send Discord healing summary', error);
    }
  }

  /**
   * Manually trigger a healing cycle (for testing/debugging)
   */
  async triggerManualCycle(): Promise<{ healed: number; checked: number }> {
    logger.info('Manual Video Healer cycle triggered');
    await this.runHealingCycle();
    return { healed: 0, checked: 0 }; // Stats would need to be tracked differently for return
  }
}
