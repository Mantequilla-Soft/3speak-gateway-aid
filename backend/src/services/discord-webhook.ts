import axios from 'axios';
import { logger } from '../utils/logger';

interface DiscordWebhookMessage {
  content?: string;
  embeds?: Array<{
    title: string;
    description: string;
    color: number;
    timestamp?: string;
    fields?: Array<{
      name: string;
      value: string;
      inline?: boolean;
    }>;
  }>;
}

export class DiscordWebhookService {
  private webhookUrl: string | null = null;
  private lastZone: 'green' | 'yellow' | 'red' | null = null;
  private lastAlertTime: Date | null = null;
  private lastGatewayHealth: 'healthy' | 'faulty' | 'dead' | null = null;

  constructor(webhookUrl?: string) {
    this.webhookUrl = webhookUrl || process.env.DISCORD_WEBHOOK_URL || null;
    if (!this.webhookUrl) {
      logger.warn('Discord webhook URL not configured - alerts disabled');
    }
  }

  /**
   * Check workload zone and send alerts if needed
   */
  async checkAndAlert(currentZone: 'green' | 'yellow' | 'red', workloadData: {
    ratio: number;
    activeJobs: number;
    activeEncoders: number;
    oldJobsDetected: boolean;
  }): Promise<void> {
    if (!this.webhookUrl) {
      return; // Webhooks disabled
    }

    const now = new Date();
    const { ratio, activeJobs, activeEncoders, oldJobsDetected } = workloadData;

    // Determine if we need to send an alert
    let shouldAlert = false;
    let alertType: 'entering_yellow' | 'entering_red' | 'red_sustained' | 'back_to_yellow' | null = null;

    if (this.lastZone !== currentZone) {
      // Zone changed
      if (this.lastZone === 'green' && currentZone === 'yellow') {
        shouldAlert = true;
        alertType = 'entering_yellow';
      } else if ((this.lastZone === 'green' || this.lastZone === 'yellow') && currentZone === 'red') {
        shouldAlert = true;
        alertType = 'entering_red';
      } else if (this.lastZone === 'red' && currentZone === 'yellow') {
        shouldAlert = true;
        alertType = 'back_to_yellow';
      }
    } else if (currentZone === 'red') {
      // Sustained red zone - alert every 10 minutes
      if (!this.lastAlertTime || (now.getTime() - this.lastAlertTime.getTime()) > (10 * 60 * 1000)) {
        shouldAlert = true;
        alertType = 'red_sustained';
      }
    }

    if (shouldAlert && alertType) {
      await this.sendAlert(alertType, currentZone, { ratio, activeJobs, activeEncoders, oldJobsDetected });
      this.lastAlertTime = now;
    }

    this.lastZone = currentZone;
  }

  /**
   * Send alert to Discord
   */
  private async sendAlert(
    alertType: 'entering_yellow' | 'entering_red' | 'red_sustained' | 'back_to_yellow',
    zone: 'green' | 'yellow' | 'red',
    workloadData: {
      ratio: number;
      activeJobs: number;
      activeEncoders: number;
      oldJobsDetected: boolean;
    }
  ): Promise<void> {
    if (!this.webhookUrl) return;

    const { ratio, activeJobs, activeEncoders, oldJobsDetected } = workloadData;

    let title: string;
    let description: string;
    let color: number;

    switch (alertType) {
      case 'entering_yellow':
        title = '🟡 Workload Alert - Entering Busy Zone';
        description = 'Encoder capacity is getting busy. Consider monitoring for potential overload.';
        color = 0xFFA500; // Orange
        break;

      case 'entering_red':
        title = '🔴 CRITICAL ALERT - Encoder Capacity Exceeded';
        description = 'System is overloaded! Immediate attention required. Consider starting additional encoders.';
        color = 0xFF0000; // Red
        break;

      case 'red_sustained':
        title = '🚨 SUSTAINED OVERLOAD - Still Critical';
        description = 'System remains in critical overload state. Additional encoder capacity urgently needed.';
        color = 0x8B0000; // Dark Red
        break;

      case 'back_to_yellow':
        title = '🟡 Workload Decreasing - Back to Busy';
        description = 'System workload has decreased from critical but is still elevated. Continue monitoring.';
        color = 0xFFD700; // Gold
        break;

      default:
        return;
    }

    const message: DiscordWebhookMessage = {
      embeds: [{
        title,
        description,
        color,
        timestamp: new Date().toISOString(),
        fields: [
          {
            name: 'Workload Ratio',
            value: `${ratio.toFixed(1)} (${ratio >= 999 ? 'Critical - No Encoders' : 'jobs per encoder'})`,
            inline: true
          },
          {
            name: 'Active Jobs',
            value: activeJobs.toString(),
            inline: true
          },
          {
            name: 'Active Encoders',
            value: activeEncoders.toString(),
            inline: true
          },
          {
            name: 'Zone Status',
            value: zone.toUpperCase(),
            inline: true
          },
          {
            name: 'Old Jobs Detected',
            value: oldJobsDetected ? '⚠️ Yes' : '✅ No',
            inline: true
          },
          {
            name: 'Timestamp',
            value: new Date().toLocaleString(),
            inline: true
          }
        ]
      }]
    };

    try {
      await axios.post(this.webhookUrl, message, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 second timeout
      });

      logger.info(`Discord alert sent successfully: ${alertType}`, {
        zone,
        ratio,
        activeJobs,
        activeEncoders
      });
    } catch (error) {
      logger.error('Failed to send Discord webhook alert:', error);
    }
  }

  /**
   * Check gateway health and send alerts on status changes
   */
  async checkGatewayHealthAndAlert(currentHealth: 'healthy' | 'faulty' | 'dead'): Promise<void> {
    if (!this.webhookUrl) {
      return; // Webhooks disabled
    }

    // Only alert if health status has changed
    if (this.lastGatewayHealth !== null && this.lastGatewayHealth !== currentHealth) {
      await this.sendGatewayHealthAlert(this.lastGatewayHealth, currentHealth);
    }

    this.lastGatewayHealth = currentHealth;
  }

  /**
   * Send gateway health change alert to Discord
   */
  private async sendGatewayHealthAlert(
    previousHealth: 'healthy' | 'faulty' | 'dead',
    currentHealth: 'healthy' | 'faulty' | 'dead'
  ): Promise<void> {
    if (!this.webhookUrl) return;

    let title: string;
    let description: string;
    let color: number;
    let emoji: string;

    // Determine alert type based on transition
    if (currentHealth === 'dead') {
      emoji = '🔴';
      title = `${emoji} GATEWAY DOWN - API Not Responding`;
      description = 'The gateway API is not responding to health checks. The gateway may be offline or unreachable.';
      color = 0xFF0000; // Red
    } else if (currentHealth === 'faulty') {
      emoji = '🟡';
      if (previousHealth === 'dead') {
        title = `${emoji} Gateway Recovering - Still Faulty`;
        description = 'Gateway API is responding again, but the last completed job was force processed. Gateway may still have issues.';
      } else {
        title = `${emoji} Gateway Health Degraded`;
        description = 'The last completed job had to be force processed. Gateway may be experiencing issues with normal job completion.';
      }
      color = 0xFFA500; // Orange
    } else if (currentHealth === 'healthy') {
      emoji = '✅';
      if (previousHealth === 'dead') {
        title = `${emoji} Gateway Fully Recovered`;
        description = 'Gateway API is responding and the last job completed normally. System is back to healthy state.';
      } else {
        title = `${emoji} Gateway Health Restored`;
        description = 'Gateway is now processing jobs normally without requiring force processing.';
      }
      color = 0x00FF00; // Green
    } else {
      return;
    }

    const healthStatusMap = {
      'healthy': '✅ Healthy',
      'faulty': '🟡 Faulty',
      'dead': '🔴 Dead'
    };

    const message: DiscordWebhookMessage = {
      embeds: [{
        title,
        description,
        color,
        timestamp: new Date().toISOString(),
        fields: [
          {
            name: 'Previous Status',
            value: healthStatusMap[previousHealth],
            inline: true
          },
          {
            name: 'Current Status',
            value: healthStatusMap[currentHealth],
            inline: true
          },
          {
            name: 'Timestamp',
            value: new Date().toLocaleString(),
            inline: false
          }
        ]
      }]
    };

    try {
      await axios.post(this.webhookUrl, message, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      logger.info(`Discord gateway health alert sent: ${previousHealth} → ${currentHealth}`);
    } catch (error) {
      logger.error('Failed to send Discord gateway health alert:', error);
    }
  }

  /**
   * Test the webhook by sending a test message
   */
  async testWebhook(): Promise<boolean> {
    if (!this.webhookUrl) {
      logger.warn('Discord webhook URL not configured');
      return false;
    }

    const testMessage: DiscordWebhookMessage = {
      embeds: [{
        title: '🧪 Test Alert - Gateway Monitor',
        description: 'This is a test message to verify Discord webhook connectivity.',
        color: 0x00FF00, // Green
        timestamp: new Date().toISOString(),
        fields: [
          {
            name: 'Status',
            value: 'Webhook is working correctly',
            inline: true
          },
          {
            name: 'Timestamp',
            value: new Date().toLocaleString(),
            inline: true
          }
        ]
      }]
    };

    try {
      await axios.post(this.webhookUrl, testMessage, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      logger.info('Discord webhook test successful');
      return true;
    } catch (error) {
      logger.error('Discord webhook test failed:', error);
      return false;
    }
  }

  /**
   * Send a custom alert message to Discord
   * Public method for use by other services (e.g., Aid timeout monitor)
   */
  async sendCustomAlert(alert: {
    title: string;
    description: string;
    color: number;
    fields?: Array<{
      name: string;
      value: string;
      inline?: boolean;
    }>;
    timestamp?: Date;
  }): Promise<void> {
    if (!this.webhookUrl) {
      logger.debug('Discord webhook not configured, skipping custom alert');
      return;
    }

    const message: DiscordWebhookMessage = {
      embeds: [{
        title: alert.title,
        description: alert.description,
        color: alert.color,
        timestamp: (alert.timestamp || new Date()).toISOString(),
        fields: alert.fields
      }]
    };

    try {
      await axios.post(this.webhookUrl, message, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      logger.info(`Custom Discord alert sent: ${alert.title}`);
    } catch (error) {
      logger.error('Failed to send custom Discord alert:', error);
    }
  }

  /**
   * Send a custom message to Discord (flexible format)
   */
  async sendCustomMessage(message: DiscordWebhookMessage): Promise<void> {
    if (!this.webhookUrl) {
      logger.debug('Discord webhook not configured, skipping custom message');
      return;
    }

    try {
      await axios.post(this.webhookUrl, message, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      logger.debug('Custom Discord message sent successfully');
    } catch (error) {
      logger.error('Failed to send custom Discord message:', error);
    }
  }
}
