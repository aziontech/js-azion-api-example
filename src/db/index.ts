/**
 * Database Client - Drizzle ORM + AWS RDS Data API
 *
 * This module provides a singleton Drizzle client configured for AWS RDS Data API.
 * It includes a fix for edge runtimes (Cloudflare Workers, Azion Functions, etc.)
 * that don't have `window.crypto` available by default.
 */

import { drizzle, type AwsDataApiPgDatabase } from 'drizzle-orm/aws-data-api/pg';
import { RDSDataClient } from '@aws-sdk/client-rds-data';
import { getRDSConfig, isRDSConfigured, getAWSCredentials } from './config.ts';
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
 * Database instance type
 */
export type Database = AwsDataApiPgDatabase<typeof schema>;

/**
 * Singleton database client
 */
let _db: Database | null = null;
let _rdsClient: RDSDataClient | null = null;

/**
 * Get the database client (singleton)
 *
 * @throws Error if RDS is not configured
 * @returns Drizzle database instance
 */
export function getDB(): Database {
  if (!_db) {
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
    _db = drizzle(_rdsClient, {
      database: config.database,
      secretArn: config.secretArn,
      resourceArn: config.resourceArn,
      schema,
    });
  }

  return _db;
}

/**
 * Get the raw RDS Data API client
 *
 * Useful for operations not supported by Drizzle.
 *
 * @throws Error if RDS is not configured
 * @returns RDSDataClient instance
 */
export function getRDSClient(): RDSDataClient {
  if (!_rdsClient) {
    getDB(); // This will initialize _rdsClient
  }
  return _rdsClient!;
}

/**
 * Check if database is available
 */
export function isDatabaseAvailable(): boolean {
  return isRDSConfigured();
}

// Re-export schema and types
export { schema };
export type { TestUser, NewTestUser } from './schema.ts';
