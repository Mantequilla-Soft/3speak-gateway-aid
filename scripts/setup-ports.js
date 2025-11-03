#!/usr/bin/env node

/**
 * Port Configuration Script
 * Reads from .env file and sets up ports dynamically for flexible deployment
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

// Simple .env parser (no external dependencies)
function loadEnv() {
  const envPath = join(process.cwd(), '.env');
  const env = {};
  
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          env[key.trim()] = valueParts.join('=').trim();
        }
      }
    }
  }
  
  return env;
}

// Load environment variables
const envVars = loadEnv();

const ports = {
  BACKEND_PORT: envVars.BACKEND_PORT || process.env.BACKEND_PORT || process.env.PORT || '3005',
  VITE_PORT: envVars.VITE_PORT || process.env.VITE_PORT || '3000', 
  WEBSOCKET_PORT: envVars.WEBSOCKET_PORT || process.env.WEBSOCKET_PORT || process.env.WS_PORT || '3002'
};

// Write port configuration for frontend build
const frontendEnvContent = Object.entries(ports)
  .map(([key, value]) => `${key}=${value}`)
  .join('\n');

// Ensure frontend directory exists
import { mkdirSync } from 'fs';
const frontendDir = join(process.cwd(), 'frontend');
if (!existsSync(frontendDir)) {
  mkdirSync(frontendDir, { recursive: true });
}

writeFileSync(join(frontendDir, '.env'), frontendEnvContent);

console.log('🔧 Port Configuration:');
console.log(`   Backend API: http://localhost:${ports.BACKEND_PORT}`);
console.log(`   Frontend:    http://localhost:${ports.VITE_PORT}`);
console.log(`   WebSocket:   ws://localhost:${ports.WEBSOCKET_PORT}`);
console.log('');
console.log('✅ Ports configured for flexible deployment');