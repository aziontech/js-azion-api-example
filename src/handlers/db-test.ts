/**
 * Database Test Handlers
 *
 * Test endpoints for the RDS Data API integration with Drizzle ORM.
 * These endpoints allow testing SELECT and INSERT operations.
 */

import type { Context } from 'hono';
import { getDB, isDatabaseAvailable, schema } from '../db/index.ts';
import type { AppEnv } from '../types.ts';

/**
 * GET /db/test
 *
 * Lists all test users from the database.
 * Requires authentication.
 *
 * Query params:
 *   - limit: number of records to return (default: 10, max: 100)
 *   - offset: number of records to skip (default: 0)
 */
export async function dbTestGetHandler(c: Context<AppEnv>) {
  const requestId = c.get('requestId');

  // Check if database is configured
  if (!isDatabaseAvailable()) {
    return c.json(
      {
        success: false,
        error: 'Database not configured',
        message: 'RDS Data API environment variables are not set',
        meta: { requestId },
      },
      503
    );
  }

  try {
    const db = getDB();

    // Get auth info for logging
    const auth = c.get('auth');
    console.log(`[${requestId}] User ${auth.user?.email} listing test users`);

    // Query users (simplified for debug - no limit/offset)
    const users = await db
      .select()
      .from(schema.testUsers);

    return c.json({
      success: true,
      data: users,
      meta: {
        count: users.length,
        requestId,
      },
    });
  } catch (error) {
    console.error(`[${requestId}] Error listing users:`, error);
    return c.json(
      {
        success: false,
        error: 'Database error',
        message: error instanceof Error ? error.message : 'Unknown error',
        meta: { requestId },
      },
      500
    );
  }
}

/**
 * Validated user input type (matches createUserSchema in validation.ts)
 */
interface CreateUserInput {
  name: string;
  email: string;
}

/**
 * POST /db/test
 *
 * Creates a new test user in the database.
 * Requires authentication.
 *
 * Body (validated by Zod middleware):
 *   - name: string (required, 1-100 chars)
 *   - email: string (required, valid email, max 255 chars)
 *
 * Note: Request body is validated by jsonValidator(createUserSchema) middleware
 * in index.ts, so we can safely access validated data via c.req.valid('json')
 */
export async function dbTestPostHandler(c: Context<AppEnv>) {
  const requestId = c.get('requestId');

  // Check if database is configured
  if (!isDatabaseAvailable()) {
    return c.json(
      {
        success: false,
        error: 'Database not configured',
        message: 'RDS Data API environment variables are not set',
        meta: { requestId },
      },
      503
    );
  }

  try {
    // Get validated data from Zod middleware
    // Body has already been validated by jsonValidator(createUserSchema)
    const { name, email } = (await c.req.json()) as CreateUserInput;

    const db = getDB();

    // Get auth info for logging
    const auth = c.get('auth');
    console.log(`[${requestId}] User ${auth.user?.email} creating test user: ${name} <${email}>`);

    // Insert new user
    const [newUser] = await db
      .insert(schema.testUsers)
      .values({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        active: true,
      })
      .returning();

    return c.json(
      {
        success: true,
        data: newUser,
        message: 'User created successfully',
        meta: {
          requestId,
        },
      },
      201
    );
  } catch (error) {
    console.error(`[${requestId}] Error creating user:`, error);
    return c.json(
      {
        success: false,
        error: 'Database error',
        message: error instanceof Error ? error.message : 'Unknown error',
        meta: {
          requestId,
        },
      },
      500
    );
  }
}


