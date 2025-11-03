# Docker configuration for Gateway Monitor
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN npm ci --only=production
RUN cd backend && npm ci --only=production
RUN cd frontend && npm ci --only=production

# Copy source code
COPY . .

# Build applications
RUN npm run build

# Production stage
FROM node:18-alpine AS production

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S gateway -u 1001

# Copy built application
COPY --from=builder --chown=gateway:nodejs /app/backend/dist ./backend/dist
COPY --from=builder --chown=gateway:nodejs /app/backend/package*.json ./backend/
COPY --from=builder --chown=gateway:nodejs /app/frontend/dist ./frontend/dist
COPY --from=builder --chown=gateway:nodejs /app/package*.json ./

# Install only production dependencies
RUN cd backend && npm ci --only=production && npm cache clean --force

# Create data directory for SQLite
RUN mkdir -p /app/data && chown gateway:nodejs /app/data
RUN mkdir -p /app/logs && chown gateway:nodejs /app/logs

# Switch to non-root user
USER gateway

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start the application
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "backend/dist/server.js"]