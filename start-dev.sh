#!/bin/bash

# Gateway Monitor Startup Script
# Handles flexible port configuration and starts development servers

echo "🚀 Gateway Monitor - Starting Development Environment"
echo "=================================================="

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found. Please create it from .env.example"
    exit 1
fi

# Source environment variables
source .env

# Create scripts directory if it doesn't exist
mkdir -p scripts

# Run port configuration script
echo "🔧 Configuring ports..."
node scripts/setup-ports.js

# Install backend dependencies if needed
if [ ! -d "backend/node_modules" ]; then
    echo "📦 Installing backend dependencies..."
    cd backend && npm install && cd ..
fi

# Install frontend dependencies if needed  
if [ ! -d "frontend/node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    cd frontend && npm install && cd ..
fi

echo ""
echo "🎯 Starting services with configuration:"
echo "   Backend Port: ${BACKEND_PORT:-3005}"
echo "   Frontend Port: ${VITE_PORT:-3000}"
echo "   WebSocket Port: ${WEBSOCKET_PORT:-3002}"
echo ""

# Start the development servers using concurrently
echo "🏃 Starting development servers..."
npx concurrently "npm run dev:server" "npm run dev:client"