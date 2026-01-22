/**
 * Mock task data for the example API
 */

import type { Task } from '../types.ts';

/**
 * Mock tasks database
 */
const MOCK_TASKS: Task[] = [
  {
    id: 1,
    title: 'Setup project structure',
    description: 'Create the initial project structure with TypeScript and Bun',
    completed: true,
    userId: 1,
    createdAt: '2024-01-01T10:00:00Z',
    updatedAt: '2024-01-01T12:00:00Z',
  },
  {
    id: 2,
    title: 'Implement authentication',
    description: 'Add authentication using @azion/js-auth library',
    completed: true,
    userId: 1,
    createdAt: '2024-01-02T09:00:00Z',
    updatedAt: '2024-01-03T15:00:00Z',
  },
  {
    id: 3,
    title: 'Create API endpoints',
    description: 'Implement REST API endpoints for tasks CRUD operations',
    completed: false,
    userId: 1,
    createdAt: '2024-01-03T08:00:00Z',
    updatedAt: '2024-01-03T08:00:00Z',
  },
  {
    id: 4,
    title: 'Add error handling',
    description: 'Integrate @azion/js-api-errors for standardized error responses',
    completed: false,
    userId: 2,
    createdAt: '2024-01-04T11:00:00Z',
    updatedAt: '2024-01-04T11:00:00Z',
  },
  {
    id: 5,
    title: 'Write documentation',
    description: 'Document API endpoints and usage examples',
    completed: false,
    userId: 2,
    createdAt: '2024-01-05T14:00:00Z',
    updatedAt: '2024-01-05T14:00:00Z',
  },
];

/**
 * Get all tasks
 */
export function getAllTasks(): Task[] {
  return MOCK_TASKS;
}

/**
 * Get task by ID
 */
export function getTaskById(id: number): Task | undefined {
  return MOCK_TASKS.find((task) => task.id === id);
}


