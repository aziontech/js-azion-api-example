/**
 * Database Client - Drizzle ORM with Dual Connection Support
 *
 * This module provides a singleton Drizzle client that supports both:
 * - Local PostgreSQL (postgres-js) when SSO_MODE=development
 * - AWS RDS Data API when SSO_MODE=stage or production
 *
 * It includes a fix for edge runtimes (Cloudflare Workers, Azion Functions, etc.)
 * that don't have `window.crypto` available by default.
 */

import { drizzle as drizzleAws, type AwsDataApiPgDatabase } from 'drizzle-orm/aws-data-api/pg';
import { drizzle as drizzlePg, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { RDSDataClient } from '@aws-sdk/client-rds-data';
import {
  getRDSConfig,
  isRDSConfigured,
  getAWSCredentials,
  getPostgresConfig,
  isPostgresConfigured,
  getDatabaseMode,
  type DatabaseMode,
} from './config.ts';
import * as schema from './schema.ts';

/**
 * Fix for edge runtimes (Cloudflare Workers, Azion Functions)
 *
 * The AWS SDK tries to use crypto from `window.crypto`, but edge runtimes
 * don't have a `window` object. This fix makes the global `crypto` available
 * where the SDK expects it.
 *
 * @see https://github.com/cloudflare/workers-aws-template
 */
function applyEdgeRuntimeFix(): void {
  if (typeof globalThis !== 'undefined' && typeof crypto !== 'undefined') {
    (globalThis as any).window = (globalThis as any).window || globalThis;
    if ((globalThis as any).window && !(globalThis as any).window.crypto) {
      (globalThis as any).window.crypto = crypto;
    }
  }
}

// Apply fix on module load
applyEdgeRuntimeFix();

/**
 * Database instance type - supports both connection types
 */
export type Database = AwsDataApiPgDatabase<typeof schema> | PostgresJsDatabase<typeof schema>;

/**
 * Singleton database client and connections
 */
let _db: Database | null = null;
let _rdsClient: RDSDataClient | null = null;
let _pgConnection: ReturnType<typeof postgres> | null = null;
let _currentMode: DatabaseMode | null = null;

/**
 * Get the database client (singleton)
 *
 * Automatically selects the appropriate connection based on SSO_MODE:
 * - development: Uses local PostgreSQL (postgres-js)
 * - stage/production: Uses AWS RDS Data API
 *
 * @throws Error if the required configuration is missing
 * @returns Drizzle database instance
 */
export function getDB(): Database {
  if (!_db || _currentMode !== getDatabaseMode()) {
    const mode = getDatabaseMode();
    _currentMode = mode;

    if (mode === 'local') {
      _db = createLocalConnection();
    } else {
      _db = createAwsConnection();
    }
  }

  return _db;
}

/**
 * Create a local PostgreSQL connection using postgres-js
 */
function createLocalConnection(): PostgresJsDatabase<typeof schema> {
  if (!isPostgresConfigured()) {
    throw new Error(
      'Local PostgreSQL is not configured. ' +
        'Please set PGUSER, PGPASSWORD, and PGDATABASE environment variables. ' +
        'Default values: PGHOST=localhost, PGPORT=5432'
    );
  }

  const config = getPostgresConfig();

  // Close existing connection if any
  if (_pgConnection) {
    _pgConnection.end();
    _pgConnection = null;
  }

  // Create new postgres connection
  _pgConnection = postgres({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
  });

  return drizzlePg(_pgConnection, { schema });
}

/**
 * Create an AWS RDS Data API connection
 */
function createAwsConnection(): AwsDataApiPgDatabase<typeof schema> {
  if (!isRDSConfigured()) {
    throw new Error(
      'RDS Data API is not configured. ' +
        'Please set RDS_RESOURCE_ARN, RDS_SECRET_ARN, and RDS_DATABASE environment variables.'
    );
  }

  const config = getRDSConfig();

  // Create RDS Data API client
  // Pass credentials explicitly for Azion runtime compatibility
  // (Azion.env.get() isn't accessible by AWS SDK's default credential provider)
  _rdsClient = new RDSDataClient({
    region: config.region,
    credentials: getAWSCredentials(),
  });

  // Create Drizzle client
  return drizzleAws(_rdsClient, {
    database: config.database,
    secretArn: config.secretArn,
    resourceArn: config.resourceArn,
    schema,
  });
}

/**
 * Get the raw RDS Data API client
 *
 * Useful for operations not supported by Drizzle.
 * Only available when using AWS mode (SSO_MODE != development).
 *
 * @throws Error if not in AWS mode or RDS is not configured
 * @returns RDSDataClient instance
 */
export function getRDSClient(): RDSDataClient {
  if (getDatabaseMode() === 'local') {
    throw new Error('RDS client is not available in local mode. Use getDB() instead.');
  }

  if (!_rdsClient) {
    getDB(); // This will initialize _rdsClient
  }
  return _rdsClient!;
}

/**
 * Close database connections
 *
 * Important for local development to properly release connections.
 * For AWS RDS Data API, this is a no-op since it's HTTP-based.
 */
export async function closeConnection(): Promise<void> {
  if (_pgConnection) {
    await _pgConnection.end();
    _pgConnection = null;
  }
  _db = null;
  _rdsClient = null;
  _currentMode = null;
}

/**
 * Check if database is available
 *
 * Returns true if the appropriate database configuration is present
 * for the current SSO_MODE.
 */
export function isDatabaseAvailable(): boolean {
  const mode = getDatabaseMode();
  return mode === 'local' ? isPostgresConfigured() : isRDSConfigured();
}

/**
 * Get the current database mode
 *
 * @returns 'local' for development, 'aws' for stage/production
 */
export function getCurrentMode(): DatabaseMode {
  return getDatabaseMode();
}

// Re-export schema and types
export { schema };
export type {
  TestUser,
  NewTestUser,
  ServiceOrder,
  NewServiceOrder,
  ServiceOrderType,
  ServiceOrderStatus,
  WebhookEvent,
  NewWebhookEvent,
  WebhookEventStatus,
} from './schema.ts';
