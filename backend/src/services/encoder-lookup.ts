import { MongoDBConnector } from './mongodb';
import { SQLiteManager } from './sqlite';
import { logger } from '../utils/logger';

export interface EncoderInfo {
  didKey: string;
  nodeName: string;
  hiveAccount?: string;
  peerId?: string;
  commitHash?: string;
  banned: boolean;
  firstSeen?: Date;
  lastSeen?: Date;
}

export class EncoderLookupService {
  private mongoConnector: MongoDBConnector;
  private sqliteManager: SQLiteManager;

  constructor(mongoConnector: MongoDBConnector, sqliteManager: SQLiteManager) {
    this.mongoConnector = mongoConnector;
    this.sqliteManager = sqliteManager;
  }

  /**
   * Get encoder info with caching strategy:
   * 1. Check SQLite cache first
   * 2. If not found, query MongoDB cluster_nodes
   * 3. Cache the result in SQLite for future lookups
   */
  async getEncoderInfo(didKey: string): Promise<EncoderInfo | null> {
    try {
      // First, check SQLite cache
      const cachedEncoder = await this.sqliteManager.getCachedEncoder(didKey);
      
      if (cachedEncoder) {
        logger.debug(`Encoder ${didKey} found in cache`);
        return {
          didKey: cachedEncoder.did_key,
          nodeName: cachedEncoder.node_name,
          hiveAccount: cachedEncoder.hive_account || undefined,
          peerId: cachedEncoder.peer_id || undefined,
          commitHash: cachedEncoder.commit_hash || undefined,
          banned: Boolean(cachedEncoder.banned),
          firstSeen: cachedEncoder.first_seen ? new Date(cachedEncoder.first_seen) : undefined,
          lastSeen: cachedEncoder.last_seen ? new Date(cachedEncoder.last_seen) : undefined
        };
      }

      // Not in cache, query MongoDB
      logger.debug(`Encoder ${didKey} not in cache, querying MongoDB`);
      const mongoEncoder = await this.mongoConnector.getEncoderFromCluster(didKey);
      
      if (mongoEncoder) {
        // Cache the result for future lookups
        await this.sqliteManager.cacheEncoder({
          didKey: mongoEncoder.didKey,
          nodeName: mongoEncoder.nodeName,
          hiveAccount: mongoEncoder.hiveAccount,
          peerId: mongoEncoder.peerId,
          commitHash: mongoEncoder.commitHash,
          banned: mongoEncoder.banned,
          firstSeen: mongoEncoder.firstSeen,
          lastSeen: mongoEncoder.lastSeen
        });

        logger.info(`Encoder ${didKey} fetched from MongoDB and cached`);
        return mongoEncoder;
      }

      logger.warn(`Encoder ${didKey} not found in MongoDB cluster_nodes`);
      return null;

    } catch (error) {
      logger.error(`Error looking up encoder ${didKey}:`, error);
      return null;
    }
  }

  /**
   * Get multiple encoder infos efficiently
   */
  async getMultipleEncoderInfos(didKeys: string[]): Promise<Map<string, EncoderInfo>> {
    const result = new Map<string, EncoderInfo>();
    
    // Process in parallel but limit concurrency to avoid overwhelming the databases
    const batchSize = 5;
    for (let i = 0; i < didKeys.length; i += batchSize) {
      const batch = didKeys.slice(i, i + batchSize);
      const promises = batch.map(async (didKey) => {
        const info = await this.getEncoderInfo(didKey);
        if (info) {
          result.set(didKey, info);
        }
      });
      
      await Promise.all(promises);
    }

    return result;
  }

  /**
   * Refresh encoder cache from MongoDB (useful for periodic updates)
   */
  async refreshEncoderCache(didKey: string): Promise<EncoderInfo | null> {
    try {
      logger.debug(`Refreshing cache for encoder ${didKey}`);
      const mongoEncoder = await this.mongoConnector.getEncoderFromCluster(didKey);
      
      if (mongoEncoder) {
        await this.sqliteManager.cacheEncoder({
          didKey: mongoEncoder.didKey,
          nodeName: mongoEncoder.nodeName,
          hiveAccount: mongoEncoder.hiveAccount,
          peerId: mongoEncoder.peerId,
          commitHash: mongoEncoder.commitHash,
          banned: mongoEncoder.banned,
          firstSeen: mongoEncoder.firstSeen,
          lastSeen: mongoEncoder.lastSeen
        });

        logger.info(`Encoder ${didKey} cache refreshed from MongoDB`);
        return mongoEncoder;
      }

      return null;
    } catch (error) {
      logger.error(`Error refreshing encoder cache for ${didKey}:`, error);
      return null;
    }
  }

  /**
   * Get all cached encoders
   */
  async getAllCachedEncoders(): Promise<EncoderInfo[]> {
    try {
      const cached = await this.sqliteManager.getAllCachedEncoders();
      return cached.map(encoder => ({
        didKey: encoder.did_key,
        nodeName: encoder.node_name,
        hiveAccount: encoder.hive_account || undefined,
        peerId: encoder.peer_id || undefined,
        commitHash: encoder.commit_hash || undefined,
        banned: Boolean(encoder.banned),
        firstSeen: encoder.first_seen ? new Date(encoder.first_seen) : undefined,
        lastSeen: encoder.last_seen ? new Date(encoder.last_seen) : undefined
      }));
    } catch (error) {
      logger.error('Error getting all cached encoders:', error);
      return [];
    }
  }
}