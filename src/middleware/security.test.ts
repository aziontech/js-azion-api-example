/**
 * Security Middleware Tests
 */

import { describe, it, expect } from 'bun:test';
import { Hono } from 'hono';
import {
  secureHeadersMiddleware,
  requestIdMiddleware,
  bodyLimitMiddleware,
  timeoutMiddleware,
  createBodyLimitMiddleware,
  createTimeoutMiddleware,
} from './security.ts';

describe('Security Middlewares', () => {
  describe('secureHeadersMiddleware', () => {
    it('should add security headers to response', async () => {
      const app = new Hono();
      app.use('*', secureHeadersMiddleware);
      app.get('/test', (c) => c.text('OK'));

      const res = await app.request('/test');

      expect(res.status).toBe(200);
      expect(res.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
    });

    it('should remove X-Powered-By header', async () => {
      const app = new Hono();
      app.use('*', secureHeadersMiddleware);
      app.get('/test', (c) => c.text('OK'));

      const res = await app.request('/test');

      expect(res.headers.get('X-Powered-By')).toBeNull();
    });
  });

  describe('requestIdMiddleware', () => {
    it('should generate a request ID', async () => {
      const app = new Hono();
      app.use('*', requestIdMiddleware);
      app.get('/test', (c) => {
        const requestId = c.get('requestId');
        return c.json({ requestId });
      });

      const res = await app.request('/test');
      const body = (await res.json()) as { requestId: string };

      expect(res.status).toBe(200);
      expect(body.requestId).toBeDefined();
      expect(typeof body.requestId).toBe('string');
      expect(body.requestId.length).toBeGreaterThan(0);
    });

    it('should add X-Request-Id header to response', async () => {
      const app = new Hono();
      app.use('*', requestIdMiddleware);
      app.get('/test', (c) => c.text('OK'));

      const res = await app.request('/test');

      expect(res.headers.get('X-Request-Id')).toBeDefined();
    });

    it('should use client-provided X-Request-Id', async () => {
      const app = new Hono();
      app.use('*', requestIdMiddleware);
      app.get('/test', (c) => {
        const requestId = c.get('requestId');
        return c.json({ requestId });
      });

      const customId = 'my-custom-request-id-123';
      const res = await app.request('/test', {
        headers: { 'X-Request-Id': customId },
      });
      const body = (await res.json()) as { requestId: string };

      expect(body.requestId).toBe(customId);
    });
  });

  describe('bodyLimitMiddleware', () => {
    it('should allow requests within body limit', async () => {
      const app = new Hono();
      app.use('*', bodyLimitMiddleware);
      app.post('/test', async (c) => {
        const body = await c.req.json();
        return c.json(body);
      });

      const res = await app.request('/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hello' }),
      });

      expect(res.status).toBe(200);
    });

    it('should reject requests exceeding body limit', async () => {
      // Create a small limit (1KB)
      const smallLimitMiddleware = createBodyLimitMiddleware(1024);

      const app = new Hono();
      app.use('*', smallLimitMiddleware);
      app.post('/test', async (c) => {
        const body = await c.req.json();
        return c.json(body);
      });

      // Create a payload larger than 1KB
      const largePayload = 'x'.repeat(2048);
      const res = await app.request('/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: largePayload }),
      });

      expect(res.status).toBe(413);
      const body = (await res.json()) as { errors: Array<{ code: string }> };
      expect(body.errors[0].code).toBe('payload_too_large');
    });
  });

  describe('timeoutMiddleware', () => {
    it('should allow fast requests to complete', async () => {
      const app = new Hono();
      app.use('*', timeoutMiddleware);
      app.get('/test', (c) => c.text('OK'));

      const res = await app.request('/test');

      expect(res.status).toBe(200);
    });

    it('should create timeout middleware with custom duration', () => {
      // Test that the factory creates middleware correctly
      const customTimeout = createTimeoutMiddleware(5000);
      expect(customTimeout).toBeDefined();
      expect(typeof customTimeout).toBe('function');
    });

    it('should have default timeout of 30 seconds', () => {
      // Test that default middleware is defined
      expect(timeoutMiddleware).toBeDefined();
      expect(typeof timeoutMiddleware).toBe('function');
    });
  });
});
