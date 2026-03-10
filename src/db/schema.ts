/**
 * Database Schema - Drizzle ORM
 *
 * Defines the database tables and their TypeScript types.
 */

import {
  pgTable,
  serial,
  varchar,
  timestamp,
  boolean,
  integer,
  uuid,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * Tax ID Type Enum
 *
 * Types: cpf, cnpj, ein, ssn, vat, abn, bn
 */
export const taxIdTypeEnum = pgEnum('tax_id_type', [
  'cpf',
  'cnpj',
  'ein',
  'ssn',
  'vat',
  'abn',
  'bn',
]);

// ---------------------------------------------------------------------------
// Service Orders Table
// ---------------------------------------------------------------------------

/**
 * Service Orders Table
 *
 * Main table for managing service subscriptions and orders.
 */
export const serviceOrders = pgTable(
  'service_orders',
  {
    id: serial('id').primaryKey(),

    // Weak Foreign Keys
    // TO-DO: multiple service orders per account allowed (one active per type)
    accountId: integer('account_id').notNull(),
    // TO-DO: 18 for now, as we need to record Stripe as a Gateway Payment. Otherwise cannot set field to NOT NULL
    gatewayId: integer('gateway_id').notNull().default(18),

    // Plan reference
    planId: uuid('plan_id').notNull(),

    // Service Order type and status
    type: varchar('type', { length: 50 }).notNull().default('plan_subscription'),
    status: varchar('status', { length: 50 }).notNull().default('DRAFT'),

    // Validity period
    startDate: timestamp('start_date', { mode: 'date' }).notNull(),
    endDate: timestamp('end_date', { mode: 'date' }),
    autoRenew: boolean('auto_renew').notNull().default(true),

    // Current billing period (from Stripe/Gateway Payment)
    currentPeriodStart: timestamp('current_period_start', { mode: 'date' }),
    currentPeriodEnd: timestamp('current_period_end', { mode: 'date' }),

    // Cancellation tracking
    cancellationDate: timestamp('cancellation_date', { mode: 'date' }),
    cancellationReason: varchar('cancellation_reason', { length: 100 }),
    canceledBy: varchar('canceled_by', { length: 50 }),

    // Grace Period tracking (for PAST_DUE status. Payments that are late)
    gracePeriodStart: timestamp('grace_period_start', { mode: 'date' }),
    gracePeriodNotified: boolean('grace_period_notified').notNull().default(false),

    // Stripe integration
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
    stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
    stripePaymentMethodId: varchar('stripe_payment_method_id', { length: 255 }),

    // Auditing - Brazil compliance
    ip: varchar('ip', { length: 45 }),
    port: integer('port'),
    ipFwd: varchar('ip_fwd', { length: 45 }),
    portFwd: integer('port_fwd'),
    timezone: varchar('timezone', { length: 50 }),

    // Fiscal/Billing Data - Data for future tax/invoice generation
    taxId: varchar('tax_id', { length: 50 }),
    taxIdType: taxIdTypeEnum('tax_id_type'),
    taxIdCountry: varchar('tax_id_country', { length: 2 }),
    legalName: varchar('legal_name', { length: 255 }),
    tradeName: varchar('trade_name', { length: 255 }),
    billingAddress: varchar('billing_address', { length: 500 }),
    billingCity: varchar('billing_city', { length: 100 }),
    billingState: varchar('billing_state', { length: 50 }),
    billingPostalCode: varchar('billing_postal_code', { length: 20 }),
    billingCountry: varchar('billing_country', { length: 2 }),

    // Timestamps and Control
    // Note: Using naive UTC datetimes because database columns are TIMESTAMP WITHOUT TIME ZONE
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    lastEditor: varchar('last_editor', { length: 255 }).notNull().default('system@azion.com'),
    lastModified: timestamp('last_modified', { mode: 'date' }).notNull().defaultNow(),
    active: boolean('active').notNull().default(true),
  },
  (table) => [
    // Index definitions
    index('idx_so_account_id').on(table.accountId),
    index('idx_so_account_type_active').on(table.accountId, table.type, table.active),
    index('idx_so_plan_id').on(table.planId),
    index('idx_so_gateway').on(table.gatewayId),
    index('idx_so_status').on(table.status),
    index('idx_so_type_status').on(table.type, table.status),
    uniqueIndex('idx_so_stripe_subscription').on(table.stripeSubscriptionId),
    index('idx_so_stripe_customer').on(table.stripeCustomerId),
    index('idx_so_start_date').on(table.startDate),
    index('idx_so_end_date_renew').on(table.endDate, table.autoRenew),
    index('idx_so_current_period_end').on(table.currentPeriodEnd),
    index('idx_so_grace_period').on(table.gracePeriodStart),
    index('idx_so_tax_id').on(table.taxId),
    index('idx_so_billing_country').on(table.billingCountry),
    index('idx_so_active_status').on(table.active, table.status),
    index('idx_so_created_at').on(table.createdAt),
  ]
);

// ---------------------------------------------------------------------------
// Test Users Table (for testing database connections)
// ---------------------------------------------------------------------------

/**
 * Test Users Table
 *
 * A simple table for testing the RDS Data API connection.
 */
export const testUsers = pgTable('test_users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  active: boolean('active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

// ---------------------------------------------------------------------------
// Type Exports
// ---------------------------------------------------------------------------

/**
 * Type for selecting a ServiceOrder (all fields)
 */
export type ServiceOrder = typeof serviceOrders.$inferSelect;

/**
 * Type for inserting a ServiceOrder (id and timestamps are optional)
 */
export type NewServiceOrder = typeof serviceOrders.$inferInsert;

/**
 * Type for selecting a TestUser (all fields)
 */
export type TestUser = typeof testUsers.$inferSelect;

/**
 * Type for inserting a TestUser (id and createdAt are optional)
 */
export type NewTestUser = typeof testUsers.$inferInsert;

/**
 * Tax ID Type values (for runtime validation)
 */
export type TaxIdTypeValue = (typeof taxIdTypeEnum.enumValues)[number];
