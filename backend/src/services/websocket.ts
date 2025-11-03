import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../utils/logger';
import { WSEvents } from '../types/index';

interface ExtendedWebSocket extends WebSocket {
  id: string;
  isAlive: boolean;
}

export class WebSocketManager {
  private wss: WebSocketServer;
  private clients: Map<string, ExtendedWebSocket> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(wsServer: WebSocketServer) {
    this.wss = wsServer;
  }

  /**
   * Initialize WebSocket server with connection handling
   */
  initialize(): void {
    this.wss.on('connection', (ws: WebSocket, request) => {
      const clientId = this.generateClientId();
      const extendedWs = ws as ExtendedWebSocket;
      extendedWs.id = clientId;
      extendedWs.isAlive = true;

      this.clients.set(clientId, extendedWs);

      logger.info(`WebSocket client connected: ${clientId}`, {
        clientsCount: this.clients.size,
        userAgent: request.headers['user-agent']
      });

      // Setup client event handlers
      this.setupClientHandlers(extendedWs);

      // Send welcome message with current status
      this.sendToClient(clientId, 'connection:established', {
        clientId,
        timestamp: new Date().toISOString(),
        message: 'Connected to Gateway Monitor'
      });
    });

    this.wss.on('error', (error) => {
      logger.error('WebSocket server error', error);
    });

    // Start heartbeat to detect dead connections
    this.startHeartbeat();

    logger.info('WebSocket manager initialized');
  }

  /**
   * Setup event handlers for individual client connections
   */
  private setupClientHandlers(ws: ExtendedWebSocket): void {
    // Handle pong responses for heartbeat
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Handle incoming messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleClientMessage(ws.id, message);
      } catch (error) {
        logger.warn(`Invalid message from client ${ws.id}`, error);
        this.sendError(ws.id, 'Invalid message format');
      }
    });

    // Handle client disconnection
    ws.on('close', () => {
      this.clients.delete(ws.id);
      logger.info(`WebSocket client disconnected: ${ws.id}`, {
        clientsCount: this.clients.size
      });
    });

    // Handle connection errors
    ws.on('error', (error) => {
      logger.error(`WebSocket client error: ${ws.id}`, error);
      this.clients.delete(ws.id);
    });
  }

  /**
   * Handle messages received from clients
   */
  private handleClientMessage(clientId: string, message: any): void {
    const { type, data } = message;

    switch (type) {
      case 'ping':
        this.sendToClient(clientId, 'pong', { timestamp: new Date().toISOString() });
        break;

      case 'subscribe':
        // Handle subscription to specific event types
        logger.info(`Client ${clientId} subscribed to: ${data?.events || 'all'}`);
        break;

      case 'request:status':
        // Send current system status
        this.sendToClient(clientId, 'status:response', {
          clients: this.clients.size,
          timestamp: new Date().toISOString()
        });
        break;

      default:
        logger.warn(`Unknown message type from client ${clientId}: ${type}`);
        this.sendError(clientId, `Unknown message type: ${type}`);
    }
  }

  /**
   * Broadcast a message to all connected clients
   */
  broadcast<K extends keyof WSEvents>(eventType: K, data: WSEvents[K]): void {
    const message = JSON.stringify({
      type: eventType,
      data,
      timestamp: new Date().toISOString()
    });

    let sentCount = 0;
    let errorCount = 0;

    this.clients.forEach((client, clientId) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
          sentCount++;
        } catch (error) {
          logger.error(`Failed to send message to client ${clientId}`, error);
          errorCount++;
          // Remove dead connection
          this.clients.delete(clientId);
        }
      }
    });

    if (sentCount > 0) {
      logger.debug(`Broadcasted ${eventType} to ${sentCount} clients`);
    }

    if (errorCount > 0) {
      logger.warn(`Failed to send to ${errorCount} clients, removed dead connections`);
    }
  }

  /**
   * Send a message to a specific client
   */
  sendToClient(clientId: string, eventType: string, data: any): void {
    const client = this.clients.get(clientId);

    if (!client || client.readyState !== WebSocket.OPEN) {
      logger.warn(`Cannot send message to client ${clientId}: not connected`);
      return;
    }

    const message = JSON.stringify({
      type: eventType,
      data,
      timestamp: new Date().toISOString()
    });

    try {
      client.send(message);
      logger.debug(`Sent ${eventType} to client ${clientId}`);
    } catch (error) {
      logger.error(`Failed to send message to client ${clientId}`, error);
      this.clients.delete(clientId);
    }
  }

  /**
   * Send an error message to a specific client
   */
  private sendError(clientId: string, errorMessage: string): void {
    this.sendToClient(clientId, 'error', {
      message: errorMessage,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Start heartbeat to detect dead connections
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const deadClients: string[] = [];

      this.clients.forEach((client, clientId) => {
        if (!client.isAlive) {
          // Client didn't respond to previous ping, mark as dead
          deadClients.push(clientId);
          client.terminate();
          return;
        }

        // Mark as not alive and send ping
        client.isAlive = false;
        try {
          client.ping();
        } catch (error) {
          logger.error(`Failed to ping client ${clientId}`, error);
          deadClients.push(clientId);
        }
      });

      // Remove dead clients
      deadClients.forEach(clientId => {
        this.clients.delete(clientId);
        logger.info(`Removed dead WebSocket client: ${clientId}`);
      });

      if (deadClients.length > 0) {
        logger.info(`Cleaned up ${deadClients.length} dead connections`);
      }

    }, 30000); // Check every 30 seconds

    logger.info('WebSocket heartbeat started');
  }

  /**
   * Stop heartbeat interval
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      logger.info('WebSocket heartbeat stopped');
    }
  }

  /**
   * Generate a unique client ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get current connection statistics
   */
  getStats(): { connectedClients: number; totalConnections: number } {
    return {
      connectedClients: this.clients.size,
      totalConnections: this.clients.size // TODO: Track total connections over time
    };
  }

  /**
   * Gracefully close all connections and cleanup
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down WebSocket manager...');

    // Stop heartbeat
    this.stopHeartbeat();

    // Close all client connections
    const closePromises: Promise<void>[] = [];
    
    this.clients.forEach((client, clientId) => {
      closePromises.push(new Promise<void>((resolve) => {
        if (client.readyState === WebSocket.OPEN) {
          client.close(1000, 'Server shutdown');
        }
        resolve();
      }));
    });

    await Promise.all(closePromises);

    // Clear clients map
    this.clients.clear();

    logger.info('WebSocket manager shutdown complete');
  }
}