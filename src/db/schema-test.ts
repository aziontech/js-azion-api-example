/**
 * Database Schema for Tests - Drizzle ORM (SQLite)
 *
 * SQLite variant of the schema for testing purposes.
 * This mirrors the PostgreSQL schema but uses SQLite-compatible types.
 */

import {
  sqliteTable,
  text,
  integer,
  real,
  index,
} from 'drizzle-orm/sqlite-core';

// ---------------------------------------------------------------------------
// Enums (as const arrays for SQLite - SQLite doesn't have native enums)
// ---------------------------------------------------------------------------

/**
 * Service Order Type values
 */
export const serviceOrderTypeEnumValues = ['plan_subscription'] as const;
export type ServiceOrderType = (typeof serviceOrderTypeEnumValues)[number];

/**
 * Service Order Status values
 */
export const serviceOrderStatusEnumValues = [
  'DRAFT',
  'ACTIVE',
  'PAST_DUE',
  'BLOCKED',
  'CANCELED',
  'EXPIRED',
] as const;
export type ServiceOrderStatus = (typeof serviceOrderStatusEnumValues)[number];

/**
 * Webhook Event Status values
 */
export const webhookEventStatusEnumValues = [
  'pending',
  'processing',
  'processed',
  'failed',
] as const;
export type WebhookEventStatus = (typeof webhookEventStatusEnumValues)[number];

// ---------------------------------------------------------------------------
// Service Orders Table
// ---------------------------------------------------------------------------

/**
 * Service Orders Table (SQLite variant)
 *
 * SQLite-specific adaptations:
 * - UUID stored as TEXT (generated via crypto.randomUUID())
 * - BIGINT stored as INTEGER (SQLite integers can handle large values)
 * - TIMESTAMP stored as INTEGER (Unix timestamp in milliseconds)
 * - JSONB stored as TEXT with mode: 'json'
 * - ENUMs stored as TEXT with explicit type casting
 */
export const serviceOrders = sqliteTable(
  'service_order',
  {
    // Primary Key - UUID stored as TEXT
    serviceOrderId: text('service_order_id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Account reference (BIGINT → INTEGER in SQLite)
    accountId: integer('account_id').notNull(),

    // Service Order type and status (ENUMs → TEXT)
    type: text('type', { enum: serviceOrderTypeEnumValues })
      .notNull()
      .default('plan_subscription'),
    status: text('status', { enum: serviceOrderStatusEnumValues })
      .notNull()
      .default('ACTIVE'),

    // Plan reference (UUID → TEXT)
    planId: text('plan_id').notNull(),

    // Gateway reference (optional, UUID → TEXT)
    gatewayId: text('gateway_id'),

    // Validity period (TIMESTAMP → INTEGER as Unix timestamp)
    startDate: integer('start_date', { mode: 'timestamp' }),
    endDate: integer('end_date', { mode: 'timestamp' }),

    // Current billing period
    currentPeriodStart: integer('current_period_start', { mode: 'timestamp' }),
    currentPeriodEnd: integer('current_period_end', { mode: 'timestamp' }),

    // Auto-renewal flag
    autoRenew: integer('auto_renew', { mode: 'boolean' }).default(true),

    // Auditing - Marco Civil da Internet (Brazil compliance)
    ip: text('ip', { length: 45 }).notNull(),
    port: integer('port').notNull(),
    ipFwd: text('ip_fwd', { length: 45 }),
    portFwd: integer('port_fwd'),
    timezone: text('timezone', { length: 50 }).notNull(),

    // Metadata - JSONB → TEXT with JSON mode
    metadata: text('metadata', { mode: 'json' })
      .notNull()
      .default({}),

    // Timestamps (TIMESTAMP → INTEGER as Unix timestamp)
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),

    // Last editor tracking
    lastEditor: text('last_editor', { length: 100 }),
  },
  (table) => [
    // Index on account_id for fast lookups by account
    index('idx_service_order_account_id').on(table.accountId),
    // Index on status for filtering
    index('idx_service_order_status').on(table.status),
    // Index on type for filtering
    index('idx_service_order_type').on(table.type),
    // Index on dates for period queries
    index('idx_service_order_dates').on(table.startDate, table.endDate),
    // Index on plan_id for plan-related queries
    index('idx_service_order_plan_id').on(table.planId),
    // Index on gateway_id for gateway-related queries
    index('idx_service_order_gateway_id').on(table.gatewayId),
  ]
);

// ---------------------------------------------------------------------------
// Webhook Events Table
// ---------------------------------------------------------------------------

/**
 * Webhook Events Table (SQLite variant)
 *
 * Stores incoming webhook events from Stripe for processing.
 */
export const webhookEvents = sqliteTable(
  'webhook_event',
  {
    // Primary Key - UUID stored as TEXT
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Stripe event ID (used for idempotency)
    stripeEventId: text('stripe_event_id', { length: 255 }).notNull().unique(),

    // Event type from Stripe (e.g., 'checkout.session.completed')
    eventType: text('event_type', { length: 100 }).notNull(),

    // Full event payload as JSON
    payload: text('payload', { mode: 'json' }).notNull(),

    // Processing status
    status: text('status', { enum: webhookEventStatusEnumValues })
      .notNull()
      .default('pending'),

    // Error message (if processing failed)
    errorMessage: text('error_message', { length: 500 }),

    // Processing timestamp
    processedAt: integer('processed_at', { mode: 'timestamp' }),

    // Timestamps
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    // Index on stripe_event_id for fast idempotency checks
    index('idx_webhook_event_stripe_id').on(table.stripeEventId),
    // Index on status for processing queue queries
    index('idx_webhook_event_status').on(table.status),
    // Index on event_type for filtering
    index('idx_webhook_event_type').on(table.eventType),
    // Index on created_at for ordering
    index('idx_webhook_event_created_at').on(table.createdAt),
  ]
);

// ---------------------------------------------------------------------------
// Test Users Table (for testing database connections)
// ---------------------------------------------------------------------------

/**
 * Test Users Table (SQLite variant)
 */
export const testUsers = sqliteTable('test_users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name', { length: 100 }).notNull(),
  email: text('email', { length: 255 }).notNull(),
  active: integer('active', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date()
  ),
});

// ---------------------------------------------------------------------------
// Type Exports
// ---------------------------------------------------------------------------

/**
 * Type for selecting a ServiceOrder (all fields)
 */
export type ServiceOrder = typeof serviceOrders.$inferSelect;

/**
 * Type for inserting a ServiceOrder (serviceOrderId and timestamps are optional)
 */
export type NewServiceOrder = typeof serviceOrders.$inferInsert;

/**
 * Type for selecting a WebhookEvent (all fields)
 */
export type WebhookEvent = typeof webhookEvents.$inferSelect;

/**
 * Type for inserting a WebhookEvent (id and timestamps are optional)
 */
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;

/**
 * Type for selecting a TestUser (all fields)
 */
export type TestUser = typeof testUsers.$inferSelect;

/**
 * Type for inserting a TestUser (id and createdAt are optional)
 */
export type NewTestUser = typeof testUsers.$inferInsert;
