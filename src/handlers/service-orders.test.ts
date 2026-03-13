/**
 * Service Orders Handler Tests
 *
 * Comprehensive tests using SQLite in-memory database with real handlers.
 * Only the Product API is mocked.
 *
 * This test file uses Bun's mock.module to replace:
 * - Database module (../db/index.js) with test database
 * - Product API client with mock implementation
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  mock,
} from 'bun:test';
import { Hono } from 'hono';
import type { AppEnv } from '../types';
import type { AuthResult } from '@azion/js-auth';

// ---------------------------------------------------------------------------
// Mock Setup - MUST be before any imports of the mocked modules
// ---------------------------------------------------------------------------

// Import test utilities first (they don't depend on the mocked modules)
import {
  resetMockPlans,
  mockGetPlanData,
  TEST_PLAN_IDS,
} from '../test-utils/product-api-mock';
import {
  createTestDb,
  closeTestDb,
  type TestDatabase,
} from '../db/test-client';
import { serviceOrders as serviceOrdersTable } from '../db/schema-test';

// Test database instance
let testDb: TestDatabase;

// Mock the database module - must be at module scope
mock.module('../db/index.js', () => ({
  getDB: () => testDb?.db,
  isDatabaseAvailable: () => testDb !== null,
  getCurrentMode: () => 'local',
  schema: {
    serviceOrders: serviceOrdersTable,
  },
}));

// Mock the Product API client
mock.module('../clients/product-api.js', () => ({
  getPlanData: mockGetPlanData,
  getPlanById: async (planId: string) => {
    const data = await mockGetPlanData(planId);
    if (Object.keys(data).length === 0) return null;
    return { id: planId, name: 'Mock Plan', type: 'subscription', active: true };
  },
}));

// Import validation middleware AFTER mocks are set up
import {
  jsonValidator,
  createServiceOrderSchema,
} from '../middleware/validation';

// Import handlers AFTER mocks are set up
import {
  listServiceOrdersHandler,
  getServiceOrderHandler,
  createServiceOrderHandler,
} from './service-orders';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JsonApiErrorResponse {
  success: false;
  error: string;
  message: string;
  meta?: { requestId: string };
}

interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
  message?: string;
  meta: {
    requestId: string;
    count?: number;
    total?: number;
    limit?: number;
    offset?: number;
  };
}

interface ServiceOrderResponse {
  serviceOrderId: string;
  accountId: number;
  planId: string;
  type: 'plan_subscription';
  status: 'DRAFT' | 'ACTIVE' | 'PAST_DUE' | 'BLOCKED' | 'CANCELED' | 'EXPIRED';
  ip: string;
  port: number;
  timezone: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// Mock auth context that matches AuthResult type
function createMockAuth(): AuthResult {
  return {
    authenticated: true,
    user: {
      id: 1,
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      isActive: true,
      isStaff: false,
      isSuperuser: false,
      isAccountOwner: true,
      accountId: 12345,
      dateJoined: '2024-01-01T00:00:00Z',
      lastLogin: null,
      timezone: 'America/Sao_Paulo',
      permissions: [],
    },
    account: {
      id: 12345,
      name: 'Test Account',
      accountType: 'client',
    },
    method: 'token',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Service Orders Handlers', () => {
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    // Create fresh test database
    testDb = createTestDb();

    // Reset mock plans to default state
    resetMockPlans();

    // Create Hono app
    app = new Hono<AppEnv>();

    // Add middleware to set auth context (normally done by auth middleware)
    app.use('*', async (c, next) => {
      c.set('auth', createMockAuth());
      c.set('requestId', 'test-request-id');
      await next();
    });

    // Add routes
    app.get('/api/v1/service-orders', listServiceOrdersHandler);
    app.get('/api/v1/service-orders/:id', getServiceOrderHandler);
    app.post('/api/v1/service-orders', jsonValidator(createServiceOrderSchema), createServiceOrderHandler);
  });

  afterEach(() => {
    closeTestDb(testDb);
    testDb = null as any;
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/service-orders - Create Service Order
  // ---------------------------------------------------------------------------

  describe('POST /api/v1/service-orders', () => {
    it('should create a service order with valid data', async () => {
      const response = await app.request('/api/v1/service-orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.100',
          'X-Forwarded-Port': '443',
        },
        body: JSON.stringify({
          accountId: 12345,
          planId: TEST_PLAN_IDS.free,
        }),
      });

      expect(response.status).toBe(201);
      const body = (await response.json()) as SuccessResponse<ServiceOrderResponse>;

      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data.accountId).toBe(12345);
      expect(body.data.planId).toBe(TEST_PLAN_IDS.free);
      expect(body.data.type).toBe('plan_subscription');
      expect(body.data.status).toBe('ACTIVE');
      expect(body.data.ip).toBe('192.168.1.100');
      expect(body.data.port).toBe(443);
      expect(body.data.timezone).toBe('America/Sao_Paulo');
    });

    it('should reject request with missing accountId', async () => {
      const response = await app.request('/api/v1/service-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: TEST_PLAN_IDS.free,
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should reject request with missing planId', async () => {
      const response = await app.request('/api/v1/service-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: 12345,
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should reject request with invalid planId format', async () => {
      const response = await app.request('/api/v1/service-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: 12345,
          planId: 'not-a-uuid',
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should reject request with negative accountId', async () => {
      const response = await app.request('/api/v1/service-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: -1,
          planId: TEST_PLAN_IDS.free,
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should return 400 when plan does not exist', async () => {
      const response = await app.request('/api/v1/service-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: 12345,
          planId: TEST_PLAN_IDS.notFound,
        }),
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as JsonApiErrorResponse;
      expect(body.error).toBe('Invalid plan');
    });

    it('should handle paid plans correctly', async () => {
      const response = await app.request('/api/v1/service-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: 99999,
          planId: TEST_PLAN_IDS.paid,
        }),
      });

      expect(response.status).toBe(201);
      const body = (await response.json()) as SuccessResponse<ServiceOrderResponse>;
      expect(body.data.planId).toBe(TEST_PLAN_IDS.paid);
    });

    it('should reject when account already has an active service order', async () => {
      // First, create a service order
      const firstResponse = await app.request('/api/v1/service-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: 12345,
          planId: TEST_PLAN_IDS.free,
        }),
      });

      expect(firstResponse.status).toBe(201);
      const firstBody = (await firstResponse.json()) as SuccessResponse<ServiceOrderResponse>;

      // Try to create another service order for the same account
      const secondResponse = await app.request('/api/v1/service-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: 12345,
          planId: TEST_PLAN_IDS.free,
        }),
      });

      expect(secondResponse.status).toBe(409);
      const secondBody = (await secondResponse.json()) as JsonApiErrorResponse;
      expect(secondBody.error).toBe('Conflict');
      expect(secondBody.message).toContain('already has an active service order');
      expect(secondBody.meta?.existingOrderId).toBe(firstBody.data.serviceOrderId);
      expect(secondBody.meta?.existingOrderStatus).toBe('ACTIVE');
    });

    it('should use default IP when headers are missing', async () => {
      const response = await app.request('/api/v1/service-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: 12345,
          planId: TEST_PLAN_IDS.free,
        }),
      });

      expect(response.status).toBe(201);
      const body = (await response.json()) as SuccessResponse<ServiceOrderResponse>;
      expect(body.data.ip).toBe('127.0.0.1');
      expect(body.data.port).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/service-orders - List Service Orders
  // ---------------------------------------------------------------------------

  describe('GET /api/v1/service-orders', () => {
    it('should return empty list when no service orders exist', async () => {
      const response = await app.request('/api/v1/service-orders');

      expect(response.status).toBe(200);
      const body = (await response.json()) as SuccessResponse<ServiceOrderResponse[]>;

      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
      expect(body.meta.count).toBe(0);
      expect(body.meta.total).toBe(0);
    });

    it('should list service orders with default pagination', async () => {
      // Create test data directly in database
      await testDb.db.insert(serviceOrdersTable).values([
        {
          accountId: 11111,
          planId: TEST_PLAN_IDS.free,
          type: 'plan_subscription',
          status: 'ACTIVE',
          ip: '192.168.1.1',
          port: 443,
          timezone: 'America/Sao_Paulo',
          metadata: {},
        },
        {
          accountId: 22222,
          planId: TEST_PLAN_IDS.paid,
          type: 'plan_subscription',
          status: 'DRAFT',
          ip: '192.168.1.2',
          port: 443,
          timezone: 'America/Sao_Paulo',
          metadata: {},
        },
      ]);

      const response = await app.request('/api/v1/service-orders');

      expect(response.status).toBe(200);
      const body = (await response.json()) as SuccessResponse<ServiceOrderResponse[]>;

      expect(body.success).toBe(true);
      expect(body.data.length).toBe(2);
      expect(body.meta.total).toBe(2);
    });

    it('should filter by status', async () => {
      // Create test data
      await testDb.db.insert(serviceOrdersTable).values([
        {
          accountId: 11111,
          planId: TEST_PLAN_IDS.free,
          type: 'plan_subscription',
          status: 'ACTIVE',
          ip: '192.168.1.1',
          port: 443,
          timezone: 'America/Sao_Paulo',
          metadata: {},
        },
        {
          accountId: 22222,
          planId: TEST_PLAN_IDS.paid,
          type: 'plan_subscription',
          status: 'DRAFT',
          ip: '192.168.1.2',
          port: 443,
          timezone: 'America/Sao_Paulo',
          metadata: {},
        },
      ]);

      const response = await app.request('/api/v1/service-orders?status=ACTIVE');

      expect(response.status).toBe(200);
      const body = (await response.json()) as SuccessResponse<ServiceOrderResponse[]>;

      expect(body.data.length).toBe(1);
      expect(body.data[0].status).toBe('ACTIVE');
      expect(body.data[0].accountId).toBe(11111);
    });

    it('should filter by accountId', async () => {
      // Create test data
      await testDb.db.insert(serviceOrdersTable).values([
        {
          accountId: 11111,
          planId: TEST_PLAN_IDS.free,
          type: 'plan_subscription',
          status: 'ACTIVE',
          ip: '192.168.1.1',
          port: 443,
          timezone: 'America/Sao_Paulo',
          metadata: {},
        },
        {
          accountId: 22222,
          planId: TEST_PLAN_IDS.paid,
          type: 'plan_subscription',
          status: 'ACTIVE',
          ip: '192.168.1.2',
          port: 443,
          timezone: 'America/Sao_Paulo',
          metadata: {},
        },
      ]);

      const response = await app.request('/api/v1/service-orders?accountId=22222');

      expect(response.status).toBe(200);
      const body = (await response.json()) as SuccessResponse<ServiceOrderResponse[]>;

      expect(body.data.length).toBe(1);
      expect(body.data[0].accountId).toBe(22222);
    });

    it('should respect limit parameter', async () => {
      // Create multiple records
      const records = Array.from({ length: 10 }, (_, i) => ({
        accountId: 10000 + i,
        planId: TEST_PLAN_IDS.free,
        type: 'plan_subscription' as const,
        status: 'ACTIVE' as const,
        ip: '192.168.1.1',
        port: 443,
        timezone: 'America/Sao_Paulo',
        metadata: {},
      }));

      await testDb.db.insert(serviceOrdersTable).values(records);

      const response = await app.request('/api/v1/service-orders?limit=5');

      expect(response.status).toBe(200);
      const body = (await response.json()) as SuccessResponse<ServiceOrderResponse[]>;

      expect(body.data.length).toBe(5);
      expect(body.meta.limit).toBe(5);
      expect(body.meta.total).toBe(10);
    });

    it('should respect offset parameter', async () => {
      // Create multiple records
      const records = Array.from({ length: 5 }, (_, i) => ({
        accountId: 10000 + i,
        planId: TEST_PLAN_IDS.free,
        type: 'plan_subscription' as const,
        status: 'ACTIVE' as const,
        ip: '192.168.1.1',
        port: 443,
        timezone: 'America/Sao_Paulo',
        metadata: {},
      }));

      await testDb.db.insert(serviceOrdersTable).values(records);

      const response = await app.request('/api/v1/service-orders?limit=2&offset=2');

      expect(response.status).toBe(200);
      const body = (await response.json()) as SuccessResponse<ServiceOrderResponse[]>;

      expect(body.data.length).toBe(2);
      expect(body.meta.offset).toBe(2);
    });

    it('should cap limit at 100', async () => {
      const response = await app.request('/api/v1/service-orders?limit=1000');

      expect(response.status).toBe(200);
      const body = (await response.json()) as SuccessResponse<ServiceOrderResponse[]>;

      expect(body.meta.limit).toBeLessThanOrEqual(100);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/service-orders/:id - Get Single Service Order
  // ---------------------------------------------------------------------------

  describe('GET /api/v1/service-orders/:id', () => {
    it('should return a service order by ID', async () => {
      // Create test data
      const [inserted] = await testDb.db
        .insert(serviceOrdersTable)
        .values({
          accountId: 12345,
          planId: TEST_PLAN_IDS.free,
          type: 'plan_subscription',
          status: 'ACTIVE',
          ip: '192.168.1.1',
          port: 443,
          timezone: 'America/Sao_Paulo',
          metadata: { foo: 'bar' },
        })
        .returning();

      const response = await app.request(
        `/api/v1/service-orders/${inserted.serviceOrderId}`
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as SuccessResponse<ServiceOrderResponse>;

      expect(body.success).toBe(true);
      expect(body.data.serviceOrderId).toBe(inserted.serviceOrderId);
      expect(body.data.accountId).toBe(12345);
      expect(body.data.metadata).toEqual({ foo: 'bar' });
    });

    it('should return 404 for non-existent ID', async () => {
      const response = await app.request(
        '/api/v1/service-orders/00000000-0000-0000-0000-000000000000'
      );

      expect(response.status).toBe(404);
      const body = (await response.json()) as JsonApiErrorResponse;
      expect(body.error).toBe('Not found');
    });

    it('should return 400 for invalid UUID format', async () => {
      const response = await app.request('/api/v1/service-orders/not-a-uuid');

      expect(response.status).toBe(400);
      const body = (await response.json()) as JsonApiErrorResponse;
      expect(body.error).toBe('Invalid ID');
    });
  });
});

// ---------------------------------------------------------------------------
// Validation-Only Tests (No Database Required)
// ---------------------------------------------------------------------------

describe('Service Orders - Validation Only', () => {
  it('should validate UUID format regex', () => {
    const UUID_REGEX =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const validUuids = [
      '550e8400-e29b-41d4-a716-446655440000',
      '550E8400-E29B-41D4-A716-446655440000',
      '550e8400-E29B-41d4-A716-446655440000',
    ];

    validUuids.forEach((uuid) => {
      expect(UUID_REGEX.test(uuid)).toBe(true);
    });

    const invalidUuids = [
      'not-a-uuid',
      '550e8400-e29b-41d4-a716',
      '',
      'g50e8400-e29b-41d4-a716-446655440000',
    ];

    invalidUuids.forEach((uuid) => {
      expect(UUID_REGEX.test(uuid)).toBe(false);
    });
  });
});
