import Database from 'sqlite3';
import { logger } from '../utils/logger';
import { Encoder, EncoderRecord, EncoderStats, DatabaseError } from '../types/index';

const { Database: SQLiteDB } = Database.verbose();

export class SQLiteManager {
  private db: Database.Database | null = null;
  private dbPath: string;
  private static instance: SQLiteManager | null = null;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  /**
   * Get singleton instance
   */
  static getInstance(dbPath?: string): SQLiteManager {
    if (!SQLiteManager.instance) {
      if (!dbPath) {
        throw new Error('dbPath is required for first SQLiteManager initialization');
      }
      SQLiteManager.instance = new SQLiteManager(dbPath);
    }
    return SQLiteManager.instance;
  }

  /**
   * Initialize the SQLite database and create tables
   */
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db = new SQLiteDB(this.dbPath, (err) => {
        if (err) {
          logger.error('Failed to connect to SQLite database', err);
          reject(new DatabaseError('SQLite connection failed', err));
          return;
        }

        logger.info(`Connected to SQLite database: ${this.dbPath}`);
        this.initializeTables()
          .then(() => resolve())
          .catch((error) => reject(error));
      });
    });
  }

  /**
   * Create the necessary tables if they don't exist
   */
  private async initializeTables(): Promise<void> {
    const createTablesSQL = `
      CREATE TABLE IF NOT EXISTS encoders (
        encoder_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        owner TEXT NOT NULL,
        location TEXT,
        hardware_type TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen DATETIME,
        is_active INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS encoder_cache (
        did_key TEXT PRIMARY KEY,
        node_name TEXT NOT NULL,
        hive_account TEXT,
        peer_id TEXT,
        commit_hash TEXT,
        banned INTEGER DEFAULT 0,
        first_seen DATETIME,
        last_seen DATETIME,
        cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS encoder_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        encoder_id TEXT,
        date DATE,
        jobs_completed INTEGER DEFAULT 0,
        total_encoding_time INTEGER DEFAULT 0,
        FOREIGN KEY (encoder_id) REFERENCES encoders(encoder_id)
      );

      CREATE INDEX IF NOT EXISTS idx_encoder_stats_date ON encoder_stats(date);
      CREATE INDEX IF NOT EXISTS idx_encoder_stats_encoder_id ON encoder_stats(encoder_id);
      CREATE INDEX IF NOT EXISTS idx_encoders_active ON encoders(is_active);
      CREATE INDEX IF NOT EXISTS idx_encoder_cache_did_key ON encoder_cache(did_key);
      CREATE INDEX IF NOT EXISTS idx_encoder_cache_updated ON encoder_cache(updated_at);
    `;

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new DatabaseError('Database not initialized'));
        return;
      }

      this.db.exec(createTablesSQL, (err) => {
        if (err) {
          logger.error('Failed to create tables', err);
          reject(new DatabaseError('Failed to create tables', err));
        } else {
          logger.info('SQLite tables initialized successfully');
          resolve();
        }
      });
    });
  }

  /**
   * Add or update an encoder in the database
   */
  async upsertEncoder(encoder: Omit<Encoder, 'created_at' | 'last_seen'>): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new DatabaseError('Database not initialized'));
        return;
      }

      const sql = `
        INSERT OR REPLACE INTO encoders 
        (encoder_id, name, owner, location, hardware_type, last_seen, is_active)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      `;

      const params = [
        encoder.encoder_id,
        encoder.name,
        encoder.owner,
        encoder.location || null,
        encoder.hardware_type || null,
        encoder.is_active ? 1 : 0
      ];

      this.db.run(sql, params, function(err) {
        if (err) {
          logger.error('Failed to upsert encoder', err);
          reject(new DatabaseError('Failed to upsert encoder', err));
        } else {
          logger.info(`Encoder ${encoder.encoder_id} upserted successfully`);
          resolve();
        }
      });
    });
  }

  /**
   * Get all encoders from the database
   */
  async getAllEncoders(): Promise<Encoder[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new DatabaseError('Database not initialized'));
        return;
      }

      const sql = 'SELECT * FROM encoders ORDER BY created_at DESC';

      this.db.all(sql, [], (err, rows: EncoderRecord[]) => {
        if (err) {
          logger.error('Failed to fetch encoders', err);
          reject(new DatabaseError('Failed to fetch encoders', err));
        } else {
          const encoders: Encoder[] = rows.map(row => ({
            encoder_id: row.encoder_id,
            name: row.name,
            owner: row.owner,
            location: row.location,
            hardware_type: row.hardware_type,
            created_at: new Date(row.created_at),
            last_seen: row.last_seen ? new Date(row.last_seen) : undefined,
            is_active: Boolean(row.is_active)
          }));

          resolve(encoders);
        }
      });
    });
  }

  /**
   * Get a specific encoder by ID
   */
  async getEncoderById(encoderId: string): Promise<Encoder | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new DatabaseError('Database not initialized'));
        return;
      }

      const sql = 'SELECT * FROM encoders WHERE encoder_id = ?';

      this.db.get(sql, [encoderId], (err, row: EncoderRecord) => {
        if (err) {
          logger.error(`Failed to fetch encoder ${encoderId}`, err);
          reject(new DatabaseError('Failed to fetch encoder', err));
        } else if (!row) {
          resolve(null);
        } else {
          const encoder: Encoder = {
            encoder_id: row.encoder_id,
            name: row.name,
            owner: row.owner,
            location: row.location,
            hardware_type: row.hardware_type,
            created_at: new Date(row.created_at),
            last_seen: row.last_seen ? new Date(row.last_seen) : undefined,
            is_active: Boolean(row.is_active)
          };

          resolve(encoder);
        }
      });
    });
  }

  /**
   * Update encoder information
   */
  async updateEncoder(encoderId: string, updates: Partial<Omit<Encoder, 'encoder_id' | 'created_at'>>): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new DatabaseError('Database not initialized'));
        return;
      }

      const fields = Object.keys(updates).filter(key => updates[key as keyof typeof updates] !== undefined);
      
      if (fields.length === 0) {
        resolve();
        return;
      }

      const setClause = fields.map(field => {
        if (field === 'is_active') {
          return 'is_active = ?';
        }
        return `${field} = ?`;
      }).join(', ');

      const values = fields.map(field => {
        const value = updates[field as keyof typeof updates];
        if (field === 'is_active') {
          return value ? 1 : 0;
        }
        return value;
      });

      const sql = `UPDATE encoders SET ${setClause}, last_seen = CURRENT_TIMESTAMP WHERE encoder_id = ?`;
      values.push(encoderId);

      this.db.run(sql, values, function(err) {
        if (err) {
          logger.error(`Failed to update encoder ${encoderId}`, err);
          reject(new DatabaseError('Failed to update encoder', err));
        } else {
          logger.info(`Encoder ${encoderId} updated successfully`);
          resolve();
        }
      });
    });
  }

  /**
   * Delete an encoder
   */
  async deleteEncoder(encoderId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new DatabaseError('Database not initialized'));
        return;
      }

      const sql = 'DELETE FROM encoders WHERE encoder_id = ?';

      this.db.run(sql, [encoderId], function(err) {
        if (err) {
          logger.error(`Failed to delete encoder ${encoderId}`, err);
          reject(new DatabaseError('Failed to delete encoder', err));
        } else {
          logger.info(`Encoder ${encoderId} deleted successfully`);
          resolve();
        }
      });
    });
  }

  /**
   * Record daily statistics for an encoder
   */
  async recordEncoderStats(stats: Omit<EncoderStats, 'id'>): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new DatabaseError('Database not initialized'));
        return;
      }

      const sql = `
        INSERT OR REPLACE INTO encoder_stats 
        (encoder_id, date, jobs_completed, total_encoding_time)
        VALUES (?, ?, ?, ?)
      `;

      const params = [
        stats.encoder_id,
        stats.date,
        stats.jobs_completed,
        stats.total_encoding_time
      ];

      this.db.run(sql, params, function(err) {
        if (err) {
          logger.error('Failed to record encoder stats', err);
          reject(new DatabaseError('Failed to record encoder stats', err));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Get encoder statistics for a date range
   */
  async getEncoderStats(encoderId?: string, days: number = 30): Promise<EncoderStats[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new DatabaseError('Database not initialized'));
        return;
      }

      let sql = `
        SELECT * FROM encoder_stats 
        WHERE date >= date('now', '-${days} days')
      `;
      const params: any[] = [];

      if (encoderId) {
        sql += ' AND encoder_id = ?';
        params.push(encoderId);
      }

      sql += ' ORDER BY date DESC, encoder_id';

      this.db.all(sql, params, (err, rows: EncoderStats[]) => {
        if (err) {
          logger.error('Failed to fetch encoder stats', err);
          reject(new DatabaseError('Failed to fetch encoder stats', err));
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve();
        return;
      }

      this.db.close((err) => {
        if (err) {
          logger.error('Error closing SQLite database', err);
          reject(new DatabaseError('Failed to close database', err));
        } else {
          logger.info('SQLite database connection closed');
          this.db = null;
          resolve();
        }
      });
    });
  }

  /**
   * Get cached encoder info by DID key
   */
  async getCachedEncoder(didKey: string): Promise<any | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new DatabaseError('Database not initialized'));
        return;
      }

      const sql = 'SELECT * FROM encoder_cache WHERE did_key = ?';

      this.db.get(sql, [didKey], (err, row: any) => {
        if (err) {
          logger.error(`Failed to fetch cached encoder ${didKey}`, err);
          reject(new DatabaseError('Failed to fetch cached encoder', err));
        } else {
          resolve(row || null);
        }
      });
    });
  }

  /**
   * Cache encoder info from MongoDB cluster_nodes
   */
  async cacheEncoder(encoderData: {
    didKey: string;
    nodeName: string;
    hiveAccount?: string;
    peerId?: string;
    commitHash?: string;
    banned?: boolean;
    firstSeen?: Date;
    lastSeen?: Date;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new DatabaseError('Database not initialized'));
        return;
      }

      const sql = `
        INSERT OR REPLACE INTO encoder_cache 
        (did_key, node_name, hive_account, peer_id, commit_hash, banned, first_seen, last_seen, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;

      const params = [
        encoderData.didKey,
        encoderData.nodeName,
        encoderData.hiveAccount || null,
        encoderData.peerId || null,
        encoderData.commitHash || null,
        encoderData.banned ? 1 : 0,
        encoderData.firstSeen ? encoderData.firstSeen.toISOString() : null,
        encoderData.lastSeen ? encoderData.lastSeen.toISOString() : null
      ];

      this.db.run(sql, params, function(err) {
        if (err) {
          logger.error('Failed to cache encoder', err);
          reject(new DatabaseError('Failed to cache encoder', err));
        } else {
          logger.info(`Encoder ${encoderData.didKey} cached successfully`);
          resolve();
        }
      });
    });
  }

  /**
   * Get all cached encoders
   */
  async getAllCachedEncoders(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new DatabaseError('Database not initialized'));
        return;
      }

      const sql = 'SELECT * FROM encoder_cache ORDER BY updated_at DESC';

      this.db.all(sql, [], (err, rows: any[]) => {
        if (err) {
          logger.error('Failed to fetch cached encoders', err);
          reject(new DatabaseError('Failed to fetch cached encoders', err));
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Health check for SQLite database
   */
  async healthCheck(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.db) {
        resolve(false);
        return;
      }

      this.db.get('SELECT 1', [], (err) => {
        resolve(!err);
      });
    });
  }
}