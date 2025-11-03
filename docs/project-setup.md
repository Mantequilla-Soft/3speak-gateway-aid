# Gateway Monitor Project Setup

## Overview
Gateway Monitor is a health monitoring service for the 3Speak video encoding infrastructure. It connects to the legacy gateway using DID key authentication to monitor system health and availability.

## Architecture

### Backend (Node.js/TypeScript)
- **MongoDB Connection**: Real 3Speak encoder database access
- **SQLite Database**: Local encoder registry and stats  
- **Gateway Health Monitor**: DID-based authentication with legacy gateway
- **WebSocket Server**: Real-time status updates
- **REST API**: Complete monitoring and statistics endpoints

### Frontend (React/TypeScript)
- **Material-UI Dashboard**: Clean monitoring interface
- **Real-time Updates**: WebSocket integration for live data
- **Gateway Health View**: DID authentication status and connectivity
- **Analytics Pages**: Job statistics and encoder performance

## Configuration

### Environment Variables
```bash
# MongoDB (3Speak Production Database)
MONGODB_VERIFICATION_ENABLED=true
MONGODB_URI=mongodb://3speak-admin:gJTe63FNQkL7aNZQ@185.130.44.183:27017/
DATABASE_NAME=spk-encoder-gateway

# Gateway Connection
GATEWAY_BASE_URL=https://encoder.3speak.tv/api/v0
GATEWAY_MONITOR_DID_KEY=did:key:z6Mkp91YfuyqZTEx3HAxb5gQuEgnwFktUR4gDod4p31wXJev

# Local Storage
SQLITE_DB_PATH=./data/gateway-monitor.db

# Server Configuration  
PORT=3005
WS_PORT=3002
```

## Gateway Authentication

The monitor connects to the 3Speak gateway using DID key authentication, mimicking an encoder node but identifying as a monitoring service.

### Authentication Flow
1. **Node Registration**: Register as monitoring node using DID key
2. **Health Checks**: Regular connectivity and response time monitoring
3. **Job Polling**: Test job API access (should return 404 for monitor)
4. **Statistics Access**: Retrieve gateway performance metrics

### DID Key Format
- **Current Key**: `did:key:z6Mkp91YfuyqZTEx3HAxb5gQuEgnwFktUR4gDod4p31wXJev`
- **Usage**: JWS token creation for gateway API authentication
- **Identification**: Monitor presents as "Gateway Monitor" service

## API Endpoints

### Gateway Health
- `GET /api/statistics/gateway-health` - Current health status
- `GET /api/statistics/gateway-comprehensive` - Full DID authentication test

### Job Monitoring  
- `GET /api/jobs/active` - Currently processing jobs
- `GET /api/jobs/completed` - Recently completed jobs
- `GET /api/jobs/:id` - Specific job details

### Statistics
- `GET /api/statistics/daily` - Daily encoding statistics
- `GET /api/statistics/encoders` - Encoder performance metrics

## Development

### Running the Application
```bash
npm run dev          # Start both frontend and backend
npm run dev:server   # Backend only (port 3005)
npm run dev:client   # Frontend only (port 3001)
```

### Testing Gateway Connection
```bash
node tests/test-gateway-simple.js   # Basic connectivity test
```

### Project Structure
```
/backend/src/
  ├── services/
  │   ├── gateway-health.ts    # DID key authentication & health monitoring
  │   ├── mongodb.ts           # 3Speak database connection  
  │   └── gateway.ts           # Legacy gateway integration
  ├── routes/                  # REST API endpoints
  └── config/                  # Environment configuration

/frontend/src/
  ├── components/
  │   └── GatewayHealth.tsx    # Real-time health dashboard
  ├── pages/                   # Dashboard, Jobs, Analytics
  └── theme.ts                 # Material-UI styling

/tests/                        # Debugging and test files
/docs/                         # Project documentation
```

## Monitoring Features

### Real-time Health Monitoring
- **Gateway Connectivity**: Response time and availability
- **DID Authentication**: Registration success/failure status  
- **Job API Access**: Polling endpoint accessibility
- **Database Status**: MongoDB and SQLite connection health

### WebSocket Updates
- **Gateway Health**: Live connectivity status (15s intervals)
- **Job Status**: Active job progress updates (30s intervals)
- **Statistics**: Daily metrics and performance data

## Troubleshooting

### Common Issues
1. **MongoDB Authentication**: Verify credentials and network access
2. **Gateway DID Key**: Ensure proper JWS token format
3. **Port Conflicts**: Frontend auto-switches from 3000 to 3001
4. **CORS Issues**: Check allowed origins in configuration

### Debug Tools
- Use files in `/tests/` directory for isolated testing
- Check browser console for frontend WebSocket connections
- Monitor backend logs for authentication and database issues

## Future Enhancements
- Proper DID key cryptographic signing
- Enhanced gateway statistics collection
- Encoder node discovery and tracking
- Performance trend analysis
- Alert system for gateway outages