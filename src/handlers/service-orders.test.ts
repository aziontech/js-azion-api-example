/**
 * Service Orders Handler Tests
 *
 * Tests for the POST /api/v1/service-orders endpoint.
 */

import { describe, it, expect } from 'bun:test';
import { Hono } from 'hono';
import { jsonValidator, createServiceOrderSchema } from '../middleware/validation';
import { createServiceOrderHandler } from './service-orders';
import type { AppEnv } from '../types';

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Response types
interface JsonApiErrorResponse {
  errors: Array<{
    code: string;
    title: string;
    detail: string;
    status: string;
    source?: { pointer: string };
    meta?: { field: string; code: string };
  }>;
}

// Drizzle uses camelCase property names in TypeScript
interface ServiceOrderData {
  serviceOrderId: string;  // camelCase in TypeScript
  accountId: number;
  planId: string;
  type: string;
  status: string;
  [key: string]: unknown;
}

interface SuccessResponse {
  success: boolean;
  data?: ServiceOrderData;
  message?: string;
  meta?: { requestId: string };
}

interface ErrorResponse {
  success: boolean;
  error: string;
  message: string;
  meta?: { requestId: string };
}

// Mock auth context
const mockAuth = {
  user: {
    id: 'test-user-id',
    email: 'test@example.com',
    accountId: 12345,
  },
  token: 'mock-token',
};

describe('Service Orders - POST Endpoint', () => {
  describe('Request Validation', () => {
    // Create a minimal app for validation testing
    const app = new Hono<AppEnv>();

    app.post(
      '/api/v1/service-orders',
      async (c, next) => {
        c.set('auth', mockAuth);
        c.set('requestId', 'test-request-id');
        await next();
      },
      jsonValidator(createServiceOrderSchema),
      async (c) => {
        // If validation passes, return success
        const body = await c.req.json();
        return c.json({ success: true, data: body }, 201);
      }
    );

    it('should reject request without accountId', async () => {
      const response = await app.request('/api/v1/service-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: '550e8400-e29b-41d4-a716-446655440000',
        }),
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as JsonApiErrorResponse;
      expect(body.errors).toBeDefined();
      expect(body.errors.length).toBeGreaterThan(0);
      expect(body.errors[0].code).toBe('validation_error');
    });

    it('should reject request without planId', async () => {
      const response = await app.request('/api/v1/service-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: 12345,
        }),
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as JsonApiErrorResponse;
      expect(body.errors).toBeDefined();
      expect(body.errors.length).toBeGreaterThan(0);
    });

    it('should reject request with invalid planId (not UUID)', async () => {
      const response = await app.request('/api/v1/service-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: 12345,
          planId: 'not-a-uuid',
        }),
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as JsonApiErrorResponse;
      expect(body.errors).toBeDefined();
      // The error message contains "UUID" (uppercase)
      expect(body.errors[0].detail.toLowerCase()).toContain('uuid');
    });

    it('should reject request with negative accountId', async () => {
      const response = await app.request('/api/v1/service-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: -1,
          planId: '550e8400-e29b-41d4-a716-446655440000',
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should reject request with zero accountId', async () => {
      const response = await app.request('/api/v1/service-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: 0,
          planId: '550e8400-e29b-41d4-a716-446655440000',
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should accept valid request with accountId and planId', async () => {
      const response = await app.request('/api/v1/service-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: 12345,
          planId: '550e8400-e29b-41d4-a716-446655440000',
        }),
      });

      expect(response.status).toBe(201);
      const body = (await response.json()) as SuccessResponse;
      expect(body.success).toBe(true);
    });
  });

  describe('Integration Test', () => {
    // Create app with full handler
    const app = new Hono<AppEnv>();

    app.post(
      '/api/v1/service-orders',
      async (c, next) => {
        c.set('auth', mockAuth);
        c.set('requestId', 'test-request-id');
        await next();
      },
      jsonValidator(createServiceOrderSchema),
      createServiceOrderHandler
    );

    it('should create service order and return 201 when database is configured', async () => {
      const testAccountId = 12345;
      const testPlanId = '550e8400-e29b-41d4-a716-446655440000';

      const response = await app.request('/api/v1/service-orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.1, 10.0.0.1',
          'X-Timezone': 'America/Sao_Paulo',
        },
        body: JSON.stringify({
          accountId: testAccountId,
          planId: testPlanId,
        }),
      });

      const body = await response.json();

      // If database is configured, we expect 201
      if (response.status === 201) {
        const successBody = body as SuccessResponse;

        // Assert status code
        expect(response.status).toBe(201);

        // Assert success flag
        expect(successBody.success).toBe(true);

        // Assert data exists
        expect(successBody.data).toBeDefined();

        // Assert serviceOrderId is a valid UUID (camelCase property name)
        expect(successBody.data!.serviceOrderId).toBeDefined();
        expect(UUID_REGEX.test(successBody.data!.serviceOrderId)).toBe(true);

        // Assert accountId matches (camelCase property name)
        expect(successBody.data!.accountId).toBe(testAccountId);

        // Assert planId matches (camelCase property name)
        expect(successBody.data!.planId).toBe(testPlanId);

        // Assert default values
        expect(successBody.data!.type).toBe('plan_subscription');
        expect(successBody.data!.status).toBe('ACTIVE');

        // Assert message
        expect(successBody.message).toBe('Service order created successfully');

        // Assert requestId in meta
        expect(successBody.meta?.requestId).toBe('test-request-id');
      } else if (response.status === 503) {
        // Database not configured - log and pass
        console.log('Skipping integration test: Database not configured');
        console.log('To run this test, set up PostgreSQL environment variables');
        expect(true).toBe(true);
      } else {
        // Unexpected error - fail the test
        console.error('Unexpected response:', body);
        throw new Error(`Expected status 201 or 503, got ${response.status}`);
      }
    });
  });
});

describe('UUID Format Validation', () => {
  it('should validate correct UUID format', () => {
    const validUuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(UUID_REGEX.test(validUuid)).toBe(true);
  });

  it('should validate UUID with uppercase letters', () => {
    const validUuid = '550E8400-E29B-41D4-A716-446655440000';
    expect(UUID_REGEX.test(validUuid)).toBe(true);
  });

  it('should validate UUID with mixed case', () => {
    const validUuid = '550e8400-E29B-41d4-A716-446655440000';
    expect(UUID_REGEX.test(validUuid)).toBe(true);
  });

  it('should reject invalid UUID formats', () => {
    const invalidUuids = [
      'not-a-uuid',
      '550e8400-e29b-41d4-a716',
      '550e8400-e29b-41d4-a716-446655440000-extra',
      '550e8400e29b41d4a716446655440000',
      'g50e8400-e29b-41d4-a716-446655440000',
      '',
    ];

    invalidUuids.forEach((uuid) => {
      expect(UUID_REGEX.test(uuid)).toBe(false);
    });
  });
});
