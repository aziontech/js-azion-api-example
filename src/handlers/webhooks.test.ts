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
import { createHmac } from 'node:crypto';

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

// Track the current SSO_MODE for testing
let currentSsoMode = 'development';
let shouldVerifySignature = false;

// Mock the database module - must be at module scope
mock.module('../db/index.js', () => ({
  getDB: () => testDb?.db,
  isDatabaseAvailable: () => testDb !== null,
  getCurrentMode: () => 'local',
  schema: {
    webhookEvents: webhookEventsTable,
  },
}));

// Mock the env module to control SSO_MODE
mock.module('../env.js', () => ({
  getEnv: (key: string, defaultValue?: string) => {
    if (key === 'SSO_MODE') {
      return currentSsoMode;
    }
    if (key === 'STRIPE_WEBHOOK_SECRET') {
      return 'whsec_test_secret_key_123';
    }
    return defaultValue ?? '';
  },
}));

// Mock the stripe client module for signature verification
mock.module('../clients/stripe.js', () => ({
  verifyStripeSignature: (payload: string, signatureHeader: string) => {
    if (!shouldVerifySignature) {
      return true; // Skip verification in development mode
    }
    // Verify the signature using the test secret
    const webhookSecret = 'whsec_test_secret_key_123';
    const match = signatureHeader.match(/t=(\d+),v1=(\w+)/);
    if (!match) {
      return false;
    }
    const timestamp = parseInt(match[1], 10);
    const providedSignature = match[2];
    
    // Compute expected signature
    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = createHmac('sha256', webhookSecret)
      .update(signedPayload)
      .digest('hex');
    
    return providedSignature === expectedSignature;
  },
  getStripeApiConfig: () => ({
    baseUrl: 'http://localhost:12111',
    timeout: 5000,
    apiKey: 'sk_test_123',
  }),
  getStripeWebhookSecret: () => 'whsec_test_secret_key_123',
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

    // Set default to development mode (no signature verification)
    currentSsoMode = 'development';
    shouldVerifySignature = false;

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
    // Reset to development mode after each test
    currentSsoMode = 'development';
    shouldVerifySignature = false;
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

  // ---------------------------------------------------------------------------
  // Signature Verification Tests (production mode)
  // ---------------------------------------------------------------------------

  describe('POST /webhooks/stripe - signature verification', () => {
    /**
     * Helper to generate a valid Stripe signature header
     */
    function generateSignatureHeader(payload: string, secret: string): string {
      const timestamp = Math.floor(Date.now() / 1000);
      const signedPayload = `${timestamp}.${payload}`;
      const signature = createHmac('sha256', secret)
        .update(signedPayload)
        .digest('hex');
      return `t=${timestamp},v1=${signature}`;
    }

    beforeEach(() => {
      // Set to production mode for signature verification tests
      currentSsoMode = 'production';
      shouldVerifySignature = true;
    });

    it('should reject webhook without Stripe-Signature header in production', async () => {
      const stripeEvent = {
        id: 'evt_test_no_sig',
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
      expect(body.message).toContain('Missing Stripe-Signature header');
    });

    it('should reject webhook with invalid signature in production', async () => {
      const stripeEvent = {
        id: 'evt_test_invalid_sig',
        object: 'event' as const,
        type: 'checkout.session.completed',
        data: { object: {} },
        created: Math.floor(Date.now() / 1000),
        livemode: false,
      };

      const response = await app.request('/webhooks/stripe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Stripe-Signature': 't=1234567890,v1=invalid_signature_here',
        },
        body: JSON.stringify(stripeEvent),
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as WebhookResponse;
      expect(body.success).toBe(false);
      expect(body.message).toContain('Invalid signature');
    });

    it('should accept webhook with valid signature in production', async () => {
      const stripeEvent = {
        id: 'evt_test_valid_sig',
        object: 'event' as const,
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_test_valid' } },
        created: Math.floor(Date.now() / 1000),
        livemode: false,
      };

      const payload = JSON.stringify(stripeEvent);
      const signatureHeader = generateSignatureHeader(payload, 'whsec_test_secret_key_123');

      const response = await app.request('/webhooks/stripe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Stripe-Signature': signatureHeader,
        },
        body: payload,
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as WebhookResponse;
      expect(body.success).toBe(true);
      expect(body.status).toBe('received');
    });
  });
});
