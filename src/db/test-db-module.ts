/**
 * Test Database Module
 *
 * This module provides a way to inject a test database into the handlers
 * during testing. It replaces the production db/index.ts module.
 *
 * Usage:
 * ```typescript
 * import { setTestDatabase, clearTestDatabase } from './db/test-db-module';
 *
 * beforeEach(() => {
 *   setTestDatabase(testDb.db);
 * });
 *
 * afterEach(() => {
 *   clearTestDatabase();
 * });
 * ```
 */

import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema-test';

/**
 * The test database instance
 */
let _testDb: BunSQLiteDatabase<typeof schema> | null = null;

/**
 * Set the test database instance
 *
 * Call this in beforeEach to inject your test database.
 */
export function setTestDatabase(db: BunSQLiteDatabase<typeof schema>): void {
  _testDb = db;
}

/**
 * Clear the test database instance
 *
 * Call this in afterEach to clean up.
 */
export function clearTestDatabase(): void {
  _testDb = null;
}

/**
 * Get the database client
 *
 * In test mode, returns the injected test database.
 * Throws if no test database has been set.
 */
export function getDB(): BunSQLiteDatabase<typeof schema> {
  if (!_testDb) {
    throw new Error('No test database set. Call setTestDatabase() first.');
  }
  return _testDb;
}

/**
 * Check if database is available
 *
 * In test mode, returns true if a test database has been set.
 */
export function isDatabaseAvailable(): boolean {
  return _testDb !== null;
}

/**
 * Get the current database mode
 *
 * Always returns 'local' in test mode.
 */
export function getCurrentMode(): 'local' {
  return 'local';
}

// Re-export schema for convenience
export { schema };
export type {
  ServiceOrder,
  NewServiceOrder,
  ServiceOrderType,
  ServiceOrderStatus,
} from './schema-test';
