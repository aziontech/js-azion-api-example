/**
 * Service Orders Handler Tests
 *
 * Tests for the POST /api/v1/service-orders endpoint validation.
 * These tests verify request validation without requiring a database connection.
 */

import { describe, it, expect } from 'bun:test';
import { Hono } from 'hono';
import { jsonValidator, createServiceOrderSchema } from '../middleware/validation';
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

interface SuccessResponse {
  success: boolean;
  data?: {
    accountId: number;
    planId: string;
  };
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

describe('Service Orders - POST Endpoint Validation', () => {
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
      // If validation passes, return success with the validated data
      const body = await c.req.json();
      return c.json({ success: true, data: body }, 201);
    }
  );

  describe('Required Fields', () => {
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
      expect(body.errors[0].meta?.field).toBe('accountId');
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
      expect(body.errors[0].meta?.field).toBe('planId');
    });
  });

  describe('Field Format Validation', () => {
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
      const body = (await response.json()) as JsonApiErrorResponse;
      expect(body.errors).toBeDefined();
      expect(body.errors[0].meta?.field).toBe('accountId');
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

    it('should reject request with non-integer accountId', async () => {
      const response = await app.request('/api/v1/service-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: 123.45,
          planId: '550e8400-e29b-41d4-a716-446655440000',
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('Valid Request', () => {
    it('should accept valid request with accountId and planId', async () => {
      const testAccountId = 12345;
      const testPlanId = '550e8400-e29b-41d4-a716-446655440000';

      const response = await app.request('/api/v1/service-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: testAccountId,
          planId: testPlanId,
        }),
      });

      // Assert status code is 201 Created
      expect(response.status).toBe(201);

      const body = (await response.json()) as SuccessResponse;

      // Assert success flag
      expect(body.success).toBe(true);

      // Assert data exists
      expect(body.data).toBeDefined();

      // Assert accountId matches (is passed through correctly)
      expect(body.data!.accountId).toBe(testAccountId);

      // Assert planId matches (is passed through correctly)
      expect(body.data!.planId).toBe(testPlanId);
    });

    it('should accept valid UUID in different formats', async () => {
      const testCases = [
        '550e8400-e29b-41d4-a716-446655440000', // lowercase
        '550E8400-E29B-41D4-A716-446655440000', // uppercase
        '550e8400-E29B-41d4-A716-446655440000', // mixed case
      ];

      for (const planId of testCases) {
        const response = await app.request('/api/v1/service-orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountId: 12345,
            planId,
          }),
        });

        expect(response.status).toBe(201);
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
