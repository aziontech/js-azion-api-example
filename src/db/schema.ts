/**
 * Database Schema - Drizzle ORM
 *
 * Defines the database tables and their TypeScript types.
 */

import { pgTable, serial, varchar, timestamp, boolean } from 'drizzle-orm/pg-core';

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

/**
 * Type for selecting a TestUser (all fields)
 */
export type TestUser = typeof testUsers.$inferSelect;

/**
 * Type for inserting a TestUser (id and createdAt are optional)
 */
export type NewTestUser = typeof testUsers.$inferInsert;
