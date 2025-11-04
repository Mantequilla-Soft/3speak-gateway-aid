#!/bin/bash

# 3Speak Gateway Aid - Production Update Script
# Usage: ./scripts/update.sh

set -e  # Exit on any error

echo "🚀 Starting Gateway Aid update..."
echo ""

# Navigate to project root
cd /opt/gatewayaid

echo "📥 Pulling latest changes from GitHub..."
git pull origin main
echo "✅ Code updated"
echo ""

echo "📦 Installing dependencies..."
echo "   → Root dependencies"
npm install --production

echo "   → Backend dependencies"
cd backend
npm install  # Need devDependencies for TypeScript build
cd ..

echo "   → Frontend dependencies"
cd frontend
npm install
cd ..
echo "✅ Dependencies installed"
echo ""

echo "🔨 Building application..."
npm run build
echo "✅ Build complete"
echo ""

echo "🔄 Restarting services..."
sudo systemctl restart gatewayaid-backend
echo "   → Backend restarted"
sudo systemctl restart gatewayaid-frontend
echo "   → Frontend restarted"
echo "✅ Services restarted"
echo ""

echo "🔍 Checking service status..."
sleep 2

BACKEND_STATUS=$(sudo systemctl is-active gatewayaid-backend)
FRONTEND_STATUS=$(sudo systemctl is-active gatewayaid-frontend)

if [ "$BACKEND_STATUS" = "active" ] && [ "$FRONTEND_STATUS" = "active" ]; then
    echo "✅ All services running successfully!"
    echo ""
    echo "🎉 Update complete!"
    echo ""
    echo "📊 Service Status:"
    sudo systemctl status gatewayaid-backend --no-pager -l | head -n 3
    sudo systemctl status gatewayaid-frontend --no-pager -l | head -n 3
else
    echo "⚠️  Warning: Some services may not be running properly"
    echo "   Backend: $BACKEND_STATUS"
    echo "   Frontend: $FRONTEND_STATUS"
    echo ""
    echo "Check logs with:"
    echo "   sudo journalctl -u gatewayaid-backend -n 50"
    echo "   sudo journalctl -u gatewayaid-frontend -n 50"
    exit 1
fi
