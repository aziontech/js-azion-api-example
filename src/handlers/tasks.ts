/**
 * Tasks handlers
 *
 * Implements the tasks API endpoints with JSON:API format responses.
 * All endpoints require authentication and client account.
 */

import type { Context } from 'hono';
import { APIErrorHTTP404 } from '@azion/js-api-errors';
import { getAllTasks, getTaskById } from '../data/tasks.ts';
import type { AppEnv, JsonApiResource, Task } from '../types.ts';

/**
 * Convert a Task to JSON:API resource format
 */
function taskToJsonApi(task: Task): JsonApiResource<Task> {
  const { id, ...attributes } = task;
  return {
    type: 'Task',
    id: String(id),
    attributes,
  };
}

/**
 * GET /tasks
 *
 * List all tasks
 */
export function listTasksHandler(c: Context<AppEnv>): Response {
  // Get auth info from context (set by middleware)
  const auth = c.get('auth');

  // Log who is accessing (example of using auth data)
  console.log(`[Tasks] User ${auth.user?.email} (account: ${auth.account?.name}) listing tasks`);

  const tasks = getAllTasks();
  const resources = tasks.map(taskToJsonApi);

  return c.json(
    { data: resources },
    200,
    { 'Content-Type': 'application/vnd.api+json' }
  );
}

/**
 * GET /tasks/:id
 *
 * Get a single task by ID
 */
export function getTaskHandler(c: Context<AppEnv>): Response {
  const auth = c.get('auth');
  const taskId = parseInt(c.req.param('id') || '', 10);

  // Validate ID
  if (isNaN(taskId)) {
    throw new APIErrorHTTP404({ field: 'id' });
  }

  const task = getTaskById(taskId);

  if (!task) {
    throw new APIErrorHTTP404();
  }

  // Log access
  console.log(`[Tasks] User ${auth.user?.email} retrieved task ${taskId}`);

  return c.json(
    { data: taskToJsonApi(task) },
    200,
    { 'Content-Type': 'application/vnd.api+json' }
  );
}
