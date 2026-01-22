/**
 * Security Middlewares for Hono
 *
 * Provides security-related middlewares following best practices:
 * - Secure Headers (similar to Django's SecurityMiddleware + XFrameOptionsMiddleware)
 * - Request ID for tracing
 * - Body Limit to prevent large payload attacks
 * - Timeout to prevent hanging requests
 */

import { secureHeaders } from 'hono/secure-headers';
import { requestId } from 'hono/request-id';
import { bodyLimit } from 'hono/body-limit';
import { timeout } from 'hono/timeout';
import { HTTPException } from 'hono/http-exception';
import type { MiddlewareHandler } from 'hono';

/**
 * Secure Headers Middleware Configuration
 *
 * Adds security headers to all responses:
 * - Removes X-Powered-By
 * - X-Content-Type-Options: nosniff
 * - X-Frame-Options: SAMEORIGIN
 * - X-XSS-Protection: 0 (modern browsers don't need this)
 * - Strict-Transport-Security (HSTS)
 * - Cross-Origin-Resource-Policy: same-origin
 * - Referrer-Policy: no-referrer
 *
 * Similar to Django's:
 * - django.middleware.security.SecurityMiddleware
 * - django.middleware.clickjacking.XFrameOptionsMiddleware
 */
export const secureHeadersMiddleware = secureHeaders({
  // Remove X-Powered-By header (default: true)
  // Prevents exposing server technology

  // X-Frame-Options: SAMEORIGIN (default)
  // Prevents clickjacking attacks
  xFrameOptions: 'SAMEORIGIN',

  // X-Content-Type-Options: nosniff (default: true)
  // Prevents MIME type sniffing
  xContentTypeOptions: 'nosniff',

  // Strict-Transport-Security (default: true)
  // Forces HTTPS connections
  strictTransportSecurity: 'max-age=31536000; includeSubDomains',

  // Cross-Origin-Resource-Policy (default: same-origin)
  crossOriginResourcePolicy: 'same-origin',

  // Referrer-Policy (default: no-referrer)
  referrerPolicy: 'strict-origin-when-cross-origin',

  // X-XSS-Protection: 0 (default)
  // Modern browsers have built-in XSS protection
  xXssProtection: '0',

  // Cross-Origin-Opener-Policy (default: same-origin)
  crossOriginOpenerPolicy: 'same-origin',
});

/**
 * Request ID Middleware
 *
 * Generates a unique ID for each request for tracing and debugging.
 * The ID is available via:
 * - c.get('requestId') in handlers
 * - X-Request-Id response header
 *
 * If the client sends X-Request-Id header, it will be used instead.
 */
export const requestIdMiddleware = requestId({
  headerName: 'X-Request-Id',
  limitLength: 255,
});

/**
 * Body Limit Middleware Factory
 *
 * Prevents large payload attacks by limiting request body size.
 *
 * @param maxSize - Maximum body size in bytes (default: 100KB)
 * @returns MiddlewareHandler
 */
export const createBodyLimitMiddleware = (
  maxSize: number = 100 * 1024
): MiddlewareHandler => {
  return bodyLimit({
    maxSize,
    onError: (c) => {
      return c.json(
        {
          errors: [
            {
              code: 'payload_too_large',
              title: 'Payload Too Large',
              detail: `Request body exceeds maximum size of ${Math.round(maxSize / 1024)}KB`,
              status: '413',
            },
          ],
        },
        413,
        { 'Content-Type': 'application/vnd.api+json' }
      );
    },
  });
};

/**
 * Default Body Limit Middleware (100KB)
 */
export const bodyLimitMiddleware = createBodyLimitMiddleware(100 * 1024);

/**
 * Timeout Middleware Factory
 *
 * Prevents requests from hanging indefinitely.
 *
 * @param duration - Timeout duration in milliseconds (default: 30000ms = 30s)
 * @returns MiddlewareHandler
 */
export const createTimeoutMiddleware = (
  duration: number = 30000
): MiddlewareHandler => {
  return timeout(duration, () => {
    throw new HTTPException(504, {
      message: `Request timeout after ${duration}ms`,
    });
  });
};

/**
 * Default Timeout Middleware (30 seconds)
 */
export const timeoutMiddleware = createTimeoutMiddleware(30000);

/**
 * Combined Security Middleware Stack
 *
 * Applies all security middlewares in the recommended order:
 * 1. Request ID (first to enable tracing from the start)
 * 2. Timeout (prevent hanging)
 * 3. Body Limit (reject large payloads early)
 * 4. Secure Headers (add security headers to response)
 */
export const securityMiddlewares = {
  requestId: requestIdMiddleware,
  timeout: timeoutMiddleware,
  bodyLimit: bodyLimitMiddleware,
  secureHeaders: secureHeadersMiddleware,
};

export default securityMiddlewares;
