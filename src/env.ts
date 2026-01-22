/**
 * Environment/Args management for Azion Edge Functions
 *
 * In Azion Edge Functions, args are passed via FetchEvent.args,
 * NOT via Azion.env.get(). This module provides a unified interface
 * for accessing environment variables across different runtimes.
 *
 * @example
 * ```typescript
 * import { getEnv, isAzionRuntime } from './env.ts';
 *
 * const mode = getEnv('SSO_MODE', 'stage');
 * console.log('Running in Azion:', isAzionRuntime());
 * ```
 */

let _azionArgs: Record<string, string> = {};

/**
 * Set Azion function args (called from azion.ts on each request)
 *
 * @param args - The args object from FetchEvent.args
 */
export function setAzionArgs(args: Record<string, string>): void {
  _azionArgs = args;
  // Also set on globalThis for modules that may access it directly
  (globalThis as any).__azionArgs = args;
}

/**
 * Get environment variable value
 *
 * Checks sources in order:
 * 1. Azion Function args (set via FetchEvent.args)
 * 2. process.env (Bun/Node.js)
 *
 * @param key - Environment variable name
 * @param defaultValue - Default value if not found
 * @returns The environment variable value or default
 */
export function getEnv(key: string, defaultValue = ''): string {
  // Try Azion Function args first
  if (key in _azionArgs) {
    return _azionArgs[key] ?? defaultValue;
  }

  // Fall back to process.env (Bun/Node.js)
  if (typeof process !== 'undefined' && process.env && key in process.env) {
    return process.env[key] ?? defaultValue;
  }

  return defaultValue;
}

/**
 * Check if running in Azion Edge environment
 *
 * @returns true if Azion args have been set (indicates edge runtime)
 */
export function isAzionRuntime(): boolean {
  return Object.keys(_azionArgs).length > 0;
}

/**
 * Get all Azion args (for debugging)
 *
 * @returns Copy of the args object
 */
export function getAzionArgs(): Record<string, string> {
  return { ..._azionArgs };
}
