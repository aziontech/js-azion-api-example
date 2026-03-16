/**
 * Test Database Client - SQLite In-Memory Database
 *
 * Provides utilities for creating and managing an in-memory SQLite database
 * for testing purposes. Each test gets a fresh database instance.
 */

import { drizzle, BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import * as schema from './schema-test';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Test database instance with both the Drizzle client and raw SQLite connection
 */
export interface TestDatabase {
  db: BunSQLiteDatabase<typeof schema>;
  sqlite: Database;
}

// ---------------------------------------------------------------------------
// Schema Creation SQL
// ---------------------------------------------------------------------------

/**
 * SQL statements to create the test schema
 *
 * These are manually written to avoid needing drizzle-kit migrations in tests.
 * They must be kept in sync with schema-test.ts
 */
const CREATE_TABLES_SQL = `
  -- Service Orders Table
  CREATE TABLE IF NOT EXISTS service_order (
    service_order_id TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL,
    type TEXT NOT NULL DEFAULT 'plan_subscription',
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    plan_id TEXT NOT NULL,
    gateway_id TEXT,
    start_date INTEGER,
    end_date INTEGER,
    current_period_start INTEGER,
    current_period_end INTEGER,
    auto_renew INTEGER DEFAULT 1,
    ip TEXT NOT NULL,
    port INTEGER NOT NULL,
    ip_fwd TEXT,
    port_fwd INTEGER,
    timezone TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_editor TEXT
  );

  -- Indexes for service_order
  CREATE INDEX IF NOT EXISTS idx_service_order_account_id ON service_order(account_id);
  CREATE INDEX IF NOT EXISTS idx_service_order_status ON service_order(status);
  CREATE INDEX IF NOT EXISTS idx_service_order_type ON service_order(type);
  CREATE INDEX IF NOT EXISTS idx_service_order_dates ON service_order(start_date, end_date);
  CREATE INDEX IF NOT EXISTS idx_service_order_plan_id ON service_order(plan_id);
  CREATE INDEX IF NOT EXISTS idx_service_order_gateway_id ON service_order(gateway_id);

  -- Webhook Events Table
  CREATE TABLE IF NOT EXISTS webhook_event (
    id TEXT PRIMARY KEY,
    stripe_event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    processed_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- Indexes for webhook_event
  CREATE INDEX IF NOT EXISTS idx_webhook_event_stripe_id ON webhook_event(stripe_event_id);
  CREATE INDEX IF NOT EXISTS idx_webhook_event_status ON webhook_event(status);
  CREATE INDEX IF NOT EXISTS idx_webhook_event_type ON webhook_event(event_type);
  CREATE INDEX IF NOT EXISTS idx_webhook_event_created_at ON webhook_event(created_at);

  -- Test Users Table
  CREATE TABLE IF NOT EXISTS test_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    created_at INTEGER
  );
`;

// ---------------------------------------------------------------------------
// Test Database Functions
// ---------------------------------------------------------------------------

/**
 * Creates a new in-memory SQLite database with the test schema
 *
 * @returns TestDatabase instance with Drizzle client and raw SQLite connection
 */
export function createTestDb(): TestDatabase {
  // Create in-memory SQLite database
  const sqlite = new Database(':memory:');

  // Enable foreign keys (good practice, though not strictly needed for our schema)
  sqlite.run('PRAGMA foreign_keys = ON');

  // Create tables
  sqlite.exec(CREATE_TABLES_SQL);

  // Create Drizzle client
  const db = drizzle(sqlite, { schema });

  return { db, sqlite };
}

/**
 * Closes the test database connection
 *
 * @param testDb - The test database instance to close
 */
export function closeTestDb(testDb: TestDatabase): void {
  testDb.sqlite.close();
}

/**
 * Clears all data from the test database tables
 *
 * This is useful for resetting state between tests without
 * recreating the entire database.
 *
 * @param testDb - The test database instance to clear
 */
export function clearTestDb(testDb: TestDatabase): void {
  testDb.sqlite.run('DELETE FROM service_order');
  testDb.sqlite.run('DELETE FROM webhook_event');
  testDb.sqlite.run('DELETE FROM test_users');
}

/**
 * Wrapper to run a test with a fresh database that automatically closes after the test
 *
 * @param testFn - The test function to run with the database
 * @returns The result of the test function
 *
 * @example
 * ```typescript
 * it('should create a service order', async () => {
 *   await withTestDb(async ({ db }) => {
 *     // Use db here
 *     const result = await db.insert(serviceOrders).values({...});
 *     expect(result).toBeDefined();
 *   });
 * });
 * ```
 */
export async function withTestDb<T>(
  testFn: (testDb: TestDatabase) => Promise<T>
): Promise<T> {
  const testDb = createTestDb();
  try {
    return await testFn(testDb);
  } finally {
    closeTestDb(testDb);
  }
}

/**
 * Wrapper to run a test with transaction rollback
 *
 * All changes made within the testFn will be rolled back,
 * providing perfect isolation between tests.
 *
 * @param testDb - The test database instance
 * @param testFn - The test function to run within a transaction
 * @returns The result of the test function
 *
 * @example
 * ```typescript
 * it('should create a service order', async () => {
 *   await withTestDb(async (testDb) => {
 *     await withRollback(testDb, async () => {
 *       // All changes here will be rolled back
 *       await testDb.db.insert(serviceOrders).values({...});
 *     });
 *   });
 * });
 * ```
 */
export async function withRollback<T>(
  testDb: TestDatabase,
  testFn: () => Promise<T>
): Promise<T> {
  testDb.sqlite.run('BEGIN TRANSACTION');
  try {
    const result = await testFn();
    return result;
  } finally {
    testDb.sqlite.run('ROLLBACK');
  }
}

// ---------------------------------------------------------------------------
// Test Utilities
// ---------------------------------------------------------------------------

/**
 * Creates a valid service order insert object with sensible defaults
 *
 * This is useful for tests that need to create service orders but don't
 * want to specify every field.
 *
 * @param overrides - Fields to override the defaults
 * @returns A valid NewServiceOrder object
 */
export function createTestServiceOrder(overrides: Partial<schema.NewServiceOrder> = {}): schema.NewServiceOrder {
  return {
    accountId: 12345,
    type: 'plan_subscription',
    status: 'ACTIVE',
    planId: '00000000-0000-0000-0000-000000000001',
    ip: '192.168.1.1',
    port: 443,
    timezone: 'America/Sao_Paulo',
    metadata: {},
    ...overrides,
  };
}

/**
 * Inserts a test service order and returns the created record
 *
 * @param db - The Drizzle database client
 * @param overrides - Fields to override the defaults
 * @returns The created service order
 */
export async function insertTestServiceOrder(
  testDb: TestDatabase,
  overrides: Partial<schema.NewServiceOrder> = {}
): Promise<schema.ServiceOrder> {
  const data = createTestServiceOrder(overrides);
  const result = await testDb.db.insert(schema.serviceOrders).values(data).returning();
  return result[0];
}
