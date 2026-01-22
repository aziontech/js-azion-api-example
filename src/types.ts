/**
 * Type definitions for the example API
 */

import type { AuthResult } from '@azion/js-auth';
import type { RequestIdVariables } from 'hono/request-id';

/**
 * Hono Environment with typed variables
 *
 * Includes:
 * - auth: Authentication result from @azion/js-auth
 * - requestId: Unique request ID for tracing (from hono/request-id)
 */
export type AppEnv = {
  Variables: {
    auth: AuthResult;
  } & RequestIdVariables;
};

/**
 * Task entity
 */
export interface Task {
  id: number;
  title: string;
  description: string;
  completed: boolean;
  userId: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * JSON:API Resource object
 */
export interface JsonApiResource<T> {
  type: string;
  id: string;
  attributes: Omit<T, 'id'>;
}


