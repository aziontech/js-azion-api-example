/**
 * Validation Middleware using Zod
 *
 * Provides request validation similar to Django REST Framework serializers.
 * Uses Zod for schema validation with JSON:API error formatting.
 */

import { zValidator } from '@hono/zod-validator';
import { z, type ZodTypeAny } from 'zod';
import type { Context } from 'hono';

/**
 * Format Zod errors to JSON:API error format
 *
 * Similar to how Django REST Framework formats validation errors.
 */
export const formatZodErrors = (error: z.ZodError, c: Context) => {
  const errors = error.issues.map((issue) => ({
    code: 'validation_error',
    title: 'Validation Error',
    detail: issue.message,
    status: '400',
    source: {
      pointer: `/${issue.path.join('/')}`,
    },
    meta: {
      field: issue.path.join('.'),
      code: issue.code,
    },
  }));

  return c.json(
    { errors },
    400,
    { 'Content-Type': 'application/vnd.api+json' }
  );
};

/**
 * Create a JSON body validator with JSON:API error formatting
 *
 * @param schema - Zod schema to validate against
 * @returns Hono middleware
 *
 * @example
 * ```typescript
 * const createUserSchema = z.object({
 *   name: z.string().min(1),
 *   email: z.string().email(),
 * });
 *
 * app.post('/users', jsonValidator(createUserSchema), (c) => {
 *   const data = c.req.valid('json');
 *   // data is typed!
 * });
 * ```
 */
export const jsonValidator = <T extends ZodTypeAny>(schema: T) => {
  return zValidator('json', schema, (result, c) => {
    if (!result.success) {
      return formatZodErrors(result.error, c);
    }
  });
};

/**
 * Create a query params validator with JSON:API error formatting
 */
export const queryValidator = <T extends ZodTypeAny>(schema: T) => {
  return zValidator('query', schema, (result, c) => {
    if (!result.success) {
      return formatZodErrors(result.error, c);
    }
  });
};

/**
 * Create a URL params validator with JSON:API error formatting
 */
export const paramValidator = <T extends ZodTypeAny>(schema: T) => {
  return zValidator('param', schema, (result, c) => {
    if (!result.success) {
      return formatZodErrors(result.error, c);
    }
  });
};

/**
 * Create a form data validator with JSON:API error formatting
 */
export const formValidator = <T extends ZodTypeAny>(schema: T) => {
  return zValidator('form', schema, (result, c) => {
    if (!result.success) {
      return formatZodErrors(result.error, c);
    }
  });
};

/**
 * Create a headers validator with JSON:API error formatting
 */
export const headerValidator = <T extends ZodTypeAny>(schema: T) => {
  return zValidator('header', schema, (result, c) => {
    if (!result.success) {
      return formatZodErrors(result.error, c);
    }
  });
};

// ============================================================================
// Common Validation Schemas
// ============================================================================

/**
 * Pagination query parameters schema
 *
 * Similar to Django REST Framework pagination:
 * - page: Page number (1-indexed)
 * - page_size: Number of items per page
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
});

/**
 * Ordering query parameter schema
 *
 * Similar to Django REST Framework ordering:
 * - ordering: Field name, prefix with '-' for descending
 */
export const orderingSchema = z.object({
  ordering: z.string().optional(),
});

/**
 * Search query parameter schema
 */
export const searchSchema = z.object({
  search: z.string().optional(),
});

/**
 * Combined list query parameters
 */
export const listQuerySchema = paginationSchema
  .merge(orderingSchema)
  .merge(searchSchema);

/**
 * ID parameter schema (for URL params)
 */
export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * UUID parameter schema (for URL params)
 */
export const uuidParamSchema = z.object({
  id: z.string().uuid(),
});

// ============================================================================
// Example Schemas (for the example API)
// ============================================================================

/**
 * Create service order schema
 *
 * Minimal client input - only accountId and planId are required.
 * Other fields (type, status, audit fields, etc.) are set programmatically
 * before recording to the database.
 */
export const createServiceOrderSchema = z.object({
  // Account reference (required)
  accountId: z
    .number()
    .int()
    .positive({ message: 'accountId must be a positive integer' }),

  // Plan reference (required) - UUID string
  planId: z.string().uuid({ message: 'planId must be a valid UUID' }),
});

/**
 * Create user schema
 */
export const createUserSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be at most 100 characters'),
  email: z
    .string()
    .email('Invalid email format')
    .max(255, 'Email must be at most 255 characters'),
});

/**
 * Update user schema (partial)
 */
export const updateUserSchema = createUserSchema.partial();

/**
 * Create task schema
 */
export const createTaskSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(200, 'Title must be at most 200 characters'),
  description: z
    .string()
    .max(1000, 'Description must be at most 1000 characters')
    .optional()
    .default(''),
  completed: z.boolean().optional().default(false),
});

/**
 * Update task schema (partial)
 */
export const updateTaskSchema = createTaskSchema.partial();

// Export Zod for convenience
export { z };
