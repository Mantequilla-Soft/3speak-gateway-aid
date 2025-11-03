import dotenv from 'dotenv';

dotenv.config();

export interface Config {
  port: number;
  nodeEnv: string;
  mongodb: {
    connectionString: string;
    database: string;
    verificationEnabled: boolean;
  };
  sqlite: {
    path: string;
  };
  gateway: {
    baseUrl: string;
    pollInterval: number;
  };
  monitoring: {
    activeJobsPollInterval: number;
    statisticsRetentionDays: number;
  };
  cors: {
    origins: string[];
  };
  logging: {
    level: string;
  };
  admin: {
    username: string;
    password: string;
  };
}

export const config: Config = {
  port: parseInt(process.env.BACKEND_PORT || process.env.PORT || '3005', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  mongodb: {
    connectionString: process.env.MONGODB_URI || 'mongodb://localhost:27017/',
    database: process.env.DATABASE_NAME || 'spk-encoder-gateway',
    verificationEnabled: process.env.MONGODB_VERIFICATION_ENABLED === 'true'
  },
  
  sqlite: {
    path: process.env.SQLITE_DB_PATH || './data/gateway-monitor.db'
  },
  
  gateway: {
    baseUrl: process.env.GATEWAY_BASE_URL || 'https://encoder-gateway.infra.3speak.tv/api/v0',
    pollInterval: parseInt(process.env.GATEWAY_POLL_INTERVAL || '5000', 10)
  },
  
  monitoring: {
    activeJobsPollInterval: parseInt(process.env.ACTIVE_JOBS_POLL_INTERVAL || '30000', 10),
    statisticsRetentionDays: parseInt(process.env.STATISTICS_RETENTION_DAYS || '30', 10)
  },
  
  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',')
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  },
  
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || ''
  }
};