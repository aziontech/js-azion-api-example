/**
 * Configuration management for the example API
 *
 * Reads configuration from environment variables using the unified
 * getEnv() function that supports both Azion Edge and Bun/Node.js.
 */

import type { EnvironmentMode } from '@azion/js-auth';
import { getEnv } from './env.ts';

/**
 * API Configuration
 */
interface Config {
  /** SSO environment mode */
  mode: EnvironmentMode;
  /** GraphQL secret for SSO communication */
  gqlSecret: string;
  /** Public key for JWT validation (optional) */
  jwtPublicKey?: string;
  /** Server port (for local development) */
  port: number;
}

/**
 * Build configuration from environment variables
 */
function getConfig(): Config {
  const mode = getEnv('SSO_MODE', 'stage') as EnvironmentMode;
  const gqlSecret = getEnv('SSO_GQL_SECRET');
  const jwtPublicKey = getEnv('PUBLIC_JWT_ACCESS_TOKEN_KEY') || undefined;
  const port = parseInt(getEnv('PORT', '3000'), 10);

  // Validate required config for non-development modes
  if (mode !== 'development' && !gqlSecret) {
    console.warn(
      '[Config] SSO_GQL_SECRET is not set. Authentication may fail in non-development mode.'
    );
  }

  return {
    mode,
    gqlSecret,
    jwtPublicKey,
    port,
  };
}

/**
 * Global config instance (lazy loaded)
 */
let _config: Config | null = null;

/**
 * Get API configuration
 *
 * Configuration is lazy-loaded on first call and cached.
 * In Azion Edge, ensure setAzionArgs() is called before accessing config.
 */
export function config(): Config {
  if (!_config) {
    _config = getConfig();
  }
  return _config;
}
