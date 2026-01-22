/**
 * Health check handler
 *
 * Public endpoint that returns API health status.
 * Does not require authentication.
 */

import type { Context } from 'hono';

/**
 * Health check response
 */
interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
  version: string;
}

/**
 * GET /health
 *
 * Returns the API health status
 */
export function healthHandler(c: Context): Response {
  const response: HealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
  };

  return c.json(response);
}
