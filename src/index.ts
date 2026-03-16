/**
 * Example API - Main Entry Point (Hono)
 *
 * This file configures the Hono app and exports for both Azion Functions and Bun.
 *
 * Middlewares applied (in order):
 * 1. Request ID - Generate unique ID for tracing
 * 2. Logger - Log requests
 * 3. Timeout - Prevent hanging requests (30s)
 * 4. Body Limit - Limit request body size (100KB)
 * 5. Secure Headers - Add security headers
 * 6. CORS - Handle cross-origin requests
 *
 * @example Azion Functions
 * ```typescript
 * export { default } from './index.ts';
 * ```
 *
 * @example Bun Server
 * ```typescript
 * import app from './index.ts';
 * export default { port: 3000, fetch: app.fetch };
 * ```
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { HTTPException } from 'hono/http-exception';
import { exceptionHandler } from '@azion/js-api-errors';
import { azionAuthMiddleware } from './middleware/auth.ts';
import {
  secureHeadersMiddleware,
  requestIdMiddleware,
  bodyLimitMiddleware,
  timeoutMiddleware,
} from './middleware/security.ts';
import {
  jsonValidator,
  createUserSchema,
  idParamSchema,
  paramValidator,
  createServiceOrderSchema,
} from './middleware/validation.ts';
import { healthHandler } from './handlers/health.ts';
import { listTasksHandler, getTaskHandler } from './handlers/tasks.ts';
import { dbTestGetHandler, dbTestPostHandler } from './handlers/db-test.ts';
import { listServiceOrdersHandler, getServiceOrderHandler, createServiceOrderHandler } from './handlers/service-orders.ts';
import { createPriceHandler } from './handlers/stripe.ts';
import { stripeWebhookHandler } from './handlers/webhooks.ts';
import type { AppEnv } from './types.ts';

// Create Hono app with typed environment
const app = new Hono<AppEnv>();

// ============================================================================
// Global Middlewares (applied to all routes)
// ============================================================================

// 1. Request ID - Generate unique ID for each request (for tracing/debugging)
//    Available via c.get('requestId') and X-Request-Id header
app.use('*', requestIdMiddleware);

// 2. Logger - Log all requests with method, path, status, and timing
app.use('*', logger());

// 3. Timeout - Prevent requests from hanging (30 seconds)
app.use('*', timeoutMiddleware);

// 4. Body Limit - Limit request body size (100KB) to prevent large payload attacks
app.use('*', bodyLimitMiddleware);

// 5. Secure Headers - Add security headers to all responses
//    - X-Frame-Options: SAMEORIGIN
//    - X-Content-Type-Options: nosniff
//    - Strict-Transport-Security
//    - Cross-Origin-Resource-Policy
//    - Referrer-Policy
app.use('*', secureHeadersMiddleware);

// 6. CORS - Handle cross-origin requests
app.use('*', cors());

// ============================================================================
// Public Routes (no authentication required)
// ============================================================================

// Health check endpoints (for load balancers and orchestrators)
app.get('/health', healthHandler);
app.get('/healthz', healthHandler);

// Webhook endpoints (public, no auth required - Stripe signs requests)
// POST /webhooks/stripe - Receive webhook events from Stripe
app.post('/webhooks/stripe', stripeWebhookHandler);

// ============================================================================
// Protected Routes (require authentication)
// ============================================================================

// Tasks endpoints with auth middleware
app.get('/tasks', azionAuthMiddleware, listTasksHandler);
app.get(
  '/tasks/:id',
  azionAuthMiddleware,
  paramValidator(idParamSchema),
  getTaskHandler
);

// Database test endpoints
// GET /db/test - List users (requires auth)
app.get('/db/test', azionAuthMiddleware, dbTestGetHandler);

// POST /db/test - Create user (requires auth + validation)
// Uses Zod schema validation for request body
app.post(
  '/db/test',
  azionAuthMiddleware,
  jsonValidator(createUserSchema),
  dbTestPostHandler
);

// Service Orders endpoints
// GET /api/v1/service-orders - List all service orders (requires auth)
app.get('/api/v1/service-orders', azionAuthMiddleware, listServiceOrdersHandler);

// POST /api/v1/service-orders - Create a new service order (requires auth + validation)
app.post(
  '/api/v1/service-orders',
  azionAuthMiddleware,
  jsonValidator(createServiceOrderSchema),
  createServiceOrderHandler
);

// GET /api/v1/service-orders/:id - Get a single service order (requires auth)
app.get('/api/v1/service-orders/:id', azionAuthMiddleware, getServiceOrderHandler);

// Stripe endpoints
// POST /api/v1/stripe/prices - Create a new price in Stripe (requires auth)
app.post('/api/v1/stripe/prices', azionAuthMiddleware, createPriceHandler);

// ============================================================================
// Error Handlers
// ============================================================================

/**
 * Get human-readable title for HTTP status codes
 */
function getHttpStatusTitle(status: number): string {
  const titles: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    408: 'Request Timeout',
    413: 'Payload Too Large',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
  };
  return titles[status] || 'Error';
}

// Global error handler using @azion/js-api-errors
// Formats all errors to JSON:API format
app.onError((err, c) => {
  // Include request ID in error logging
  const requestId = c.get('requestId');
  console.error(`[${requestId}] Error:`, err.message || err);

  // Handle Hono's HTTPException (timeout, body limit, etc.)
  if (err instanceof HTTPException) {
    const status = err.status;
    return c.json(
      {
        errors: [
          {
            code: `http_error_${status}`,
            title: getHttpStatusTitle(status),
            detail: err.message || `HTTP ${status} error`,
            status: String(status),
            meta: {
              requestId,
            },
          },
        ],
      },
      status,
      { 'Content-Type': 'application/vnd.api+json' }
    );
  }

  // Fallback to @azion/js-api-errors handler for other errors
  const response = exceptionHandler(err, { request: c.req.raw });
  return response;
});

// 404 handler for unmatched routes
app.notFound((c) => {
  const requestId = c.get('requestId');
  return c.json(
    {
      errors: [
        {
          code: '10004',
          title: 'Not Found',
          detail: 'The requested resource was not found.',
          status: '404',
          meta: {
            requestId,
          },
        },
      ],
    },
    404,
    { 'Content-Type': 'application/vnd.api+json' }
  );
});

export default app;
