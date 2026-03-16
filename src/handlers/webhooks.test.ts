/**
 * Webhooks Handler Tests
 *
 * Tests for Stripe webhook endpoint using SQLite in-memory database.
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

// ---------------------------------------------------------------------------
// Mock Setup - MUST be before any imports of the mocked modules
// ---------------------------------------------------------------------------

import {
  createTestDb,
  closeTestDb,
  type TestDatabase,
} from '../db/test-client';
import { webhookEvents as webhookEventsTable } from '../db/schema-test';

// Test database instance
let testDb: TestDatabase;

// Mock the database module - must be at module scope
mock.module('../db/index.js', () => ({
  getDB: () => testDb?.db,
  isDatabaseAvailable: () => testDb !== null,
  getCurrentMode: () => 'local',
  schema: {
    webhookEvents: webhookEventsTable,
  },
}));

// Import handlers AFTER mocks are set up
import { stripeWebhookHandler } from './webhooks';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WebhookResponse {
  success: boolean;
  message: string;
  eventId?: string;
  status?: 'received' | 'duplicate';
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Webhooks Handler', () => {
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    // Create fresh test database
    testDb = createTestDb();

    // Create Hono app
    app = new Hono<AppEnv>();

    // Add middleware to set request ID (normally done by middleware)
    app.use('*', async (c, next) => {
      c.set('requestId', 'test-request-id');
      await next();
    });

    // Add routes
    app.post('/webhooks/stripe', stripeWebhookHandler);
  });

  afterEach(() => {
    closeTestDb(testDb);
    testDb = null as any;
  });

  // ---------------------------------------------------------------------------
  // POST /webhooks/stripe
  // ---------------------------------------------------------------------------

  describe('POST /webhooks/stripe', () => {
    it('should register webhook with pending status', async () => {
      const stripeEvent = {
        id: 'evt_test_pending',
        object: 'event' as const,
        type: 'checkout.session.completed',
        data: {
          object: { id: 'cs_test_xyz' },
        },
        created: Math.floor(Date.now() / 1000),
        livemode: false,
      };

      const response = await app.request('/webhooks/stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stripeEvent),
      });

      expect(response.status).toBe(200);

      // Verify the event was stored with pending status
      const storedEvents = await testDb.db
        .select()
        .from(webhookEventsTable)
        .where(({ stripeEventId }) => ({ stripeEventId }));

      // Check via raw query
      const events = await testDb.db
        .select()
        .from(webhookEventsTable);

      const storedEvent = events.find(e => e.stripeEventId === 'evt_test_pending');
      expect(storedEvent).toBeDefined();
      expect(storedEvent?.status).toBe('pending');
    });

    it('should return duplicate status for already processed event', async () => {
      const stripeEvent = {
        id: 'evt_test_duplicate',
        object: 'event' as const,
        type: 'checkout.session.completed',
        data: {
          object: { id: 'cs_test_dup' },
        },
        created: Math.floor(Date.now() / 1000),
        livemode: false,
      };

      // First request
      const firstResponse = await app.request('/webhooks/stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stripeEvent),
      });

      expect(firstResponse.status).toBe(200);
      const firstBody = (await firstResponse.json()) as WebhookResponse;
      expect(firstBody.status).toBe('received');

      // Second request (duplicate)
      const secondResponse = await app.request('/webhooks/stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stripeEvent),
      });

      expect(secondResponse.status).toBe(200);
      const secondBody = (await secondResponse.json()) as WebhookResponse;
      expect(secondBody.status).toBe('duplicate');
      expect(secondBody.message).toBe('Event already processed');
      expect(secondBody.eventId).toBe(firstBody.eventId);
    });

    it('should reject webhook with missing event ID', async () => {
      const stripeEvent = {
        // Missing id
        object: 'event' as const,
        type: 'checkout.session.completed',
        data: { object: {} },
        created: Math.floor(Date.now() / 1000),
        livemode: false,
      };

      const response = await app.request('/webhooks/stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stripeEvent),
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as WebhookResponse;
      expect(body.success).toBe(false);
      expect(body.message).toContain('missing required fields');
    });

    it('should reject webhook with missing type', async () => {
      const stripeEvent = {
        id: 'evt_test_no_type',
        object: 'event' as const,
        // Missing type
        data: { object: {} },
        created: Math.floor(Date.now() / 1000),
        livemode: false,
      };

      const response = await app.request('/webhooks/stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stripeEvent),
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as WebhookResponse;
      expect(body.success).toBe(false);
      expect(body.message).toContain('missing required fields');
    });
  });
});
