/**
 * Database Configuration
 *
 * Supports both AWS RDS Data API and local PostgreSQL connections.
 * The connection type is determined by SSO_MODE environment variable:
 * - development: Uses local PostgreSQL (postgres-js)
 * - stage/production: Uses AWS RDS Data API
 *
 * Reads configuration from environment variables using the unified
 * getEnv() function that supports both Azion Edge and Bun/Node.js.
 */

import { getEnv } from '../env.ts';

/**
 * Database connection mode
 */
export type DatabaseMode = 'local' | 'aws';

/**
 * RDS Data API Configuration
 */
export interface RDSConfig {
  /** AWS Region */
  region: string;
  /** ARN of the Aurora Serverless cluster */
  resourceArn: string;
  /** ARN of the secret in AWS Secrets Manager */
  secretArn: string;
  /** Database name */
  database: string;
}

/**
 * Local PostgreSQL Configuration
 */
export interface PostgresConfig {
  /** Database host */
  host: string;
  /** Database port */
  port: number;
  /** Database user */
  user: string;
  /** Database password */
  password: string;
  /** Database name */
  database: string;
}

/**
 * Get RDS configuration from environment
 */
export function getRDSConfig(): RDSConfig {
  return {
    region: getEnv('RDS_REGION', 'us-east-1'),
    resourceArn: getEnv('RDS_RESOURCE_ARN'),
    secretArn: getEnv('RDS_SECRET_ARN'),
    database: getEnv('RDS_DATABASE'),
  };
}

/**
 * Validate RDS configuration
 * Returns true if all required fields are present
 */
export function isRDSConfigured(): boolean {
  const config = getRDSConfig();
  return !!(config.resourceArn && config.secretArn && config.database);
}

/**
 * Get database connection mode based on SSO_MODE
 *
 * @returns 'local' for development, 'aws' for stage/production
 */
export function getDatabaseMode(): DatabaseMode {
  const mode = getEnv('SSO_MODE', 'stage');
  return mode === 'development' ? 'local' : 'aws';
}

/**
 * Get local PostgreSQL configuration from environment
 */
export function getPostgresConfig(): PostgresConfig {
  return {
    host: getEnv('PGHOST', 'localhost'),
    port: parseInt(getEnv('PGPORT', '5432'), 10),
    user: getEnv('PGUSER'),
    password: getEnv('PGPASSWORD'),
    database: getEnv('PGDATABASE'),
  };
}

/**
 * Validate local PostgreSQL configuration
 * Returns true if all required fields are present
 */
export function isPostgresConfigured(): boolean {
  const config = getPostgresConfig();
  return !!(config.user && config.password && config.database);
}

/**
 * AWS Credentials for SDK
 */
export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * Get AWS credentials for SDK
 *
 * The AWS SDK doesn't use Azion.env.get() - it reads from process.env directly.
 * This function bridges the gap by reading credentials via our getEnv() helper
 * and returning them in a format the SDK can use.
 *
 * @returns Credentials object if both keys are available, undefined otherwise
 *          (letting SDK use default provider chain: ~/.aws/credentials, IAM role, etc.)
 */
export function getAWSCredentials(): AWSCredentials | undefined {
  const accessKeyId = getEnv('AWS_ACCESS_KEY_ID');
  const secretAccessKey = getEnv('AWS_SECRET_ACCESS_KEY');

  if (accessKeyId && secretAccessKey) {
    return { accessKeyId, secretAccessKey };
  }

  // Return undefined to let SDK use default credential provider chain
  return undefined;
}
