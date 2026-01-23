# 3Speak Gateway Monitor

A comprehensive monitoring and management dashboard for the 3Speak video encoding infrastructure. Real-time visibility into job queues, encoder performance, and system health across the distributed encoding fleet.

![Gateway Monitor](docs/screenshot.png)

## ✨ Features

### 📊 **Dashboard**
- Real-time gateway health monitoring with LED indicator
- Live encoder workload gauge
- Active jobs count and queue statistics
- Force-processing detection and alerts

### 📋 **Jobs Management**
- **Available Jobs**: Queue of pending encoding jobs with auto-refresh
- **Active Jobs**: Real-time progress tracking with encoding metrics
- **Completed Jobs**: Historical analysis with duration analytics
- Human-readable encoder names (from SQLite lookup)
- Duration calculations (total time, encoding time)

### 🖥️ **Encoder Management**
- Full CRUD operations for encoder registry
- Human-readable names mapped to DID keys
- Status tracking (Active/Inactive)
- Last seen timestamps
- **Protected with HTTP Basic Auth** for mutations

### 📈 **Analytics & Insights**
- Interactive charts with Recharts
- Time range selector (7/30/90 days)
- **KPI Cards**: Total videos, avg encoding time, success rate
- **Jobs Over Time**: Line chart with dual Y-axis
- **Quality Distribution**: Pie chart by resolution
- **Encoder Performance**: Bar chart comparison
- Manual refresh (no auto-polling for analytics)

### 🆘 **Gateway Aid Fallback System**
- REST API fallback when websocket connection fails
- Atomic job claiming to prevent duplicates
- Heartbeat-based timeout monitoring
- Job ownership verification
- DID-based authentication
- See [Gateway Aid Implementation Guide](docs/GATEWAY_AID_ENCODER_IMPLEMENTATION.md)

## 🏗️ Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  React Frontend │────▶│  Express Backend │────▶│    MongoDB      │
│   (Port 3000)   │     │   (Port 3005)    │     │  (Job Storage)  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │     SQLite       │
                        │ (Encoder Metadata)│
                        └──────────────────┘
```

**Tech Stack:**
- **Backend**: Node.js, TypeScript, Express
- **Frontend**: React, TypeScript, Material-UI, Recharts
- **Databases**: MongoDB (jobs), SQLite (encoders)
- **Auth**: HTTP Basic Authentication
- **Real-time**: Auto-refresh intervals (configurable per page)

## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **MongoDB** instance with access credentials
- Access to 3Speak Gateway API

### Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd gatewaymonitor
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure backend environment**:
   ```bash
   cd backend
   cp .env.example .env
   ```
   
   Edit `backend/.env` with your configuration:
   ```bash
   # Database Connections
   MONGODB_VERIFICATION_ENABLED=true
   MONGODB_URI=mongodb://username:password@host:port/
   DATABASE_NAME=spk-encoder-gateway
   SQLITE_DB_PATH=./data/gateway-monitor.db

   # Gateway API
   GATEWAY_BASE_URL=https://encoder.3speak.tv/api/v0

   # Gateway Monitor Identity
   GATEWAY_MONITOR_DID_KEY=did:key:your_did_key_here
   GATEWAY_MONITOR_PRIVATE_KEY=your_private_key_here

   # Admin Credentials (for encoder CRUD operations)
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=your-secure-password-here

   # Service Ports
   PORT=3005
   FRONTEND_PORT=3000
   WEBSOCKET_PORT=3002
   ```

4. **Start development servers**:
   ```bash
   npm run dev
   ```

   This launches:
   - Backend API: `http://localhost:3005`
   - Frontend UI: `http://localhost:3000`

## 📖 Usage

### Development

**Start both services:**
```bash
npm run dev
```

**Backend only:**
```bash
npm run dev:server
```

**Frontend only:**
```bash
npm run dev:client
```

### Production

**Build the project:**
```bash
npm run build
```

**Start production servers:**
```bash
npm start
```

## 🔒 Security

### Admin Authentication

Encoder management operations (Create, Update, Delete) are protected with **HTTP Basic Authentication**:

1. Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `backend/.env`
2. When creating/editing/deleting encoders in the UI, browser prompts for credentials
3. Enter the admin credentials from your `.env` file
4. Session persists in browser until closed

**Protected Endpoints:**
- `POST /api/encoders` - Create encoder
- `PUT /api/encoders/:id` - Update encoder
- `DELETE /api/encoders/:id` - Delete encoder

**Public Endpoints:**
- `GET /api/encoders` - View encoders
- `POST /api/encoders/:id/heartbeat` - Encoder check-ins

## 📡 API Reference

### Jobs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/jobs/available` | Available jobs queue |
| GET | `/api/jobs/active` | Jobs currently encoding |
| GET | `/api/jobs/completed` | Completed jobs history |
| GET | `/api/jobs/:id` | Specific job details |

### Encoders

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/encoders` | List all encoders | No |
| POST | `/api/encoders` | Register new encoder | **Yes** |
| PUT | `/api/encoders/:id` | Update encoder | **Yes** |
| DELETE | `/api/encoders/:id` | Delete encoder | **Yes** |
| GET | `/api/encoders/:id/stats` | Encoder statistics | No |

### Statistics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/statistics/daily?days=30` | Daily aggregated stats |
| GET | `/api/statistics/encoders?days=30` | Per-encoder metrics |
| GET | `/api/statistics/dashboard` | Dashboard summary |
| GET | `/api/statistics/gateway-health` | Gateway health status |

### Gateway Aid API (Fallback System)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/aid/v1/health` | GET | Health check (no auth) |
| `/aid/v1/list-jobs` | POST | List available jobs for claiming |
| `/aid/v1/claim-job` | POST | Atomically claim a job |
| `/aid/v1/job/:id` | GET | Get job details + ownership verification |
| `/aid/v1/update-job` | POST | Update job progress (heartbeat) |
| `/aid/v1/complete-job` | POST | Complete job with results |

**Authentication**: All Aid endpoints (except health) require `X-Encoder-DID` header.

For detailed implementation guide, see [Gateway Aid Documentation](docs/GATEWAY_AID_ENCODER_IMPLEMENTATION.md).

## 🗂️ Project Structure

```
gatewaymonitor/
├── backend/
│   ├── src/
│   │   ├── config/           # Configuration management
│   │   ├── routes/           # API endpoints
│   │   │   ├── encoders.ts   # Encoder CRUD + auth
│   │   │   ├── jobs.ts       # Job management
│   │   │   └── statistics.ts # Analytics endpoints
│   │   ├── services/
│   │   │   ├── mongodb.ts          # MongoDB connector
│   │   │   ├── sqlite.ts           # SQLite manager
│   │   │   ├── encoder-lookup.ts   # DID ↔ Name mapping
│   │   │   ├── gateway.ts          # Gateway API client
│   │   │   └── gateway-health.ts   # Health monitoring
│   │   ├── utils/
│   │   │   ├── auth.ts       # HTTP Basic Auth middleware
│   │   │   └── logger.ts     # Logging utility
│   │   ├── types/            # TypeScript interfaces
│   │   └── server.ts         # Express app
│   ├── data/                 # SQLite database files
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── GatewayHealthLED.tsx  # Health indicator
│   │   │   ├── WorkloadGauge.tsx     # Workload dial
│   │   │   └── Layout.tsx            # App shell
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx   # Main dashboard
│   │   │   ├── Jobs.tsx        # Jobs management
│   │   │   ├── Encoders.tsx    # Encoder CRUD
│   │   │   └── Analytics.tsx   # Charts & insights
│   │   ├── theme.ts      # MUI theme
│   │   └── main.tsx
│   └── package.json
├── package.json          # Root workspace config
└── README.md
```

## 🔧 Configuration

### Environment Variables

**Backend** (`backend/.env`):
```bash
# Required
MONGODB_URI=mongodb://user:pass@host:port/
DATABASE_NAME=spk-encoder-gateway
ADMIN_USERNAME=admin
ADMIN_PASSWORD=secure-password

# Optional
LOG_LEVEL=info
GATEWAY_POLL_INTERVAL=5000
CORS_ORIGINS=http://localhost:3000
```

### Port Configuration

Default ports (configurable via `.env`):
- Backend API: `3005`
- Frontend Dev: `3000`
- WebSocket: `3002`

## 🐳 Docker Deployment

```bash
docker-compose up -d
```

## 🧪 Testing

```bash
npm test
```

## 📝 Changelog

### v1.0.0 (Current)
- ✅ Dashboard with real-time health monitoring
- ✅ Jobs page (Available/Active/Completed tabs)
- ✅ Encoder management with HTTP Basic Auth
- ✅ Analytics page with interactive charts
- ✅ Encoder name resolution via SQLite
- ✅ Duration analytics and forced job detection

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

MIT License - see LICENSE file for details

## 👥 Authors

- @meno

## 🆘 Support

For issues and questions:
- Open an issue in the repository
- Contact: @meno

---

**Built with ❤️ for the 3Speak community**