/**
 * External Services Configuration
 *
 * Manages URLs and authentication for external APIs.
 * URLs vary based on SSO_MODE environment variable.
 */

import { getEnv } from './env.ts';

/**
 * Application configuration
 */
export interface AppConfig {
  mode: string;
  gqlSecret: string;
  jwtPublicKey: string;
  port: number;
}

/**
 * Get application configuration from environment
 *
 * This is the main config function used by auth middleware and server.
 */
export function config(): AppConfig {
  return {
    mode: getEnv('SSO_MODE', 'stage'),
    gqlSecret: getEnv('SSO_GQL_SECRET', ''),
    jwtPublicKey: getEnv('PUBLIC_JWT_ACCESS_TOKEN_KEY', ''),
    port: parseInt(getEnv('PORT', '3000'), 10),
  };
}

/**
 * Environment mode type
 */
export type EnvironmentMode = 'development' | 'stage' | 'production';

/**
 * Get the current environment mode from SSO_MODE
 */
export function getEnvironmentMode(): EnvironmentMode {
  const mode = getEnv('SSO_MODE', 'stage');
  if (mode === 'development') return 'development';
  if (mode === 'production') return 'production';
  return 'stage';
}

/**
 * Product API Configuration
 */
export interface ProductApiConfig {
  baseUrl: string;
  timeout: number;
}

/**
 * Get Product API configuration based on environment
 *
 * Development: localhost:7777
 * Stage: staging product API URL
 * Production: production product API URL
 */
export function getProductApiConfig(): ProductApiConfig {
  const mode = getEnvironmentMode();
  
  const baseUrls: Record<EnvironmentMode, string> = {
    development: getEnv('PRODUCT_API_URL', 'http://localhost:7777'),
    stage: getEnv('PRODUCT_API_URL', 'https://api.staging.azion.com/products'),
    production: getEnv('PRODUCT_API_URL', 'https://api.azion.com/products'),
  };
  
  return {
    baseUrl: baseUrls[mode],
    timeout: parseInt(getEnv('PRODUCT_API_TIMEOUT', '5000'), 10),
  };
}

/**
 * Accounts API Configuration
 */
export interface AccountsApiConfig {
  baseUrl: string;
  timeout: number;
}

/**
 * Get Accounts API configuration based on environment
 */
export function getAccountsApiConfig(): AccountsApiConfig {
  const mode = getEnvironmentMode();
  
  const baseUrls: Record<EnvironmentMode, string> = {
    development: getEnv('ACCOUNTS_API_URL', 'http://localhost:7777'),
    stage: getEnv('ACCOUNTS_API_URL', 'https://api.staging.azion.com/accounts'),
    production: getEnv('ACCOUNTS_API_URL', 'https://api.azion.com/accounts'),
  };
  
  return {
    baseUrl: baseUrls[mode],
    timeout: parseInt(getEnv('ACCOUNTS_API_TIMEOUT', '5000'), 10),
  };
}
