/**
 * Development server using Bun + Hono
 *
 * Starts a local HTTP server for development and testing.
 *
 * Usage:
 *   SSO_MODE=stage SSO_GQL_SECRET=<secret> bun run src/server.ts
 *
 * Or with .env file:
 *   bun run src/server.ts
 */

import app from './index.ts';
import { config } from './config.ts';
import { isRDSConfigured, getRDSConfig } from './db/config.ts';

const cfg = config();
const rdsConfigured = isRDSConfigured();
const rdsConfig = getRDSConfig();

console.log('');
console.log('===========================================');
console.log('  Example API - Development Server (Hono)');
console.log('===========================================');
console.log('');
console.log('  SSO Configuration:');
console.log(`    Mode:      ${cfg.mode}`);
console.log(`    Secret:    ${cfg.gqlSecret ? '***configured***' : 'NOT SET'}`);
console.log('');
console.log('  RDS Configuration:');
console.log(`    Status:    ${rdsConfigured ? 'CONFIGURED' : 'NOT CONFIGURED'}`);
if (rdsConfigured) {
  console.log(`    Region:    ${rdsConfig.region}`);
  console.log(`    Database:  ${rdsConfig.database}`);
  console.log(`    Resource:  ${rdsConfig.resourceArn.substring(0, 50)}...`);
}
console.log('');
console.log('  Endpoints:');
console.log(`    GET  http://localhost:${cfg.port}/health        (public)`);
console.log(`    GET  http://localhost:${cfg.port}/tasks         (requires auth)`);
console.log(`    GET  http://localhost:${cfg.port}/tasks/:id     (requires auth)`);
console.log('');
console.log('  Database Test Endpoints:');
console.log(`    GET  http://localhost:${cfg.port}/db/test       (requires auth) - List users`);
console.log(`    POST http://localhost:${cfg.port}/db/test       (requires auth) - Create user`);
console.log('');
console.log('  Authentication:');
console.log('    - Cookie: azsid_stg (for stage)');
console.log('    - Header: Authorization: token <api-token>');
console.log('');
console.log('===========================================');
console.log('');

// Hono's native Bun export format
// idleTimeout must be greater than the Hono timeout middleware (30s)
// to allow proper timeout responses instead of connection drops
export default {
  port: cfg.port,
  fetch: app.fetch,
  idleTimeout: 60, // 60 seconds (> 30s timeout middleware)
};

console.log(`Server running at http://localhost:${cfg.port}`);
