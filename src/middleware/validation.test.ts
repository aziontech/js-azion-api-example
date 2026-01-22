/**
 * Validation Middleware Tests
 */

import { describe, it, expect } from 'bun:test';
import { Hono } from 'hono';
import {
  jsonValidator,
  queryValidator,
  paramValidator,
  createUserSchema,
  idParamSchema,
  paginationSchema,
} from './validation.ts';

// Type for JSON:API error response
interface JsonApiErrorResponse {
  errors: Array<{
    code: string;
    title: string;
    detail: string;
    status: string;
    source?: { pointer: string };
    meta?: { field: string; code: string };
  }>;
}

// Type for success response
interface SuccessResponse {
  success: boolean;
  data?: { name: string; email: string };
}

// Type for pagination response
interface PaginationResponse {
  page: number;
  page_size: number;
}

// Type for ID response
interface IdResponse {
  id: number;
}

describe('Validation Middlewares', () => {
  describe('jsonValidator', () => {
    it('should validate valid JSON body', async () => {
      const app = new Hono();
      app.post('/users', jsonValidator(createUserSchema), async (c) => {
        const body = await c.req.json();
        return c.json({ success: true, data: body });
      });

      const res = await app.request('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'John Doe',
          email: 'john@example.com',
        }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as SuccessResponse;
      expect(body.success).toBe(true);
      expect(body.data?.name).toBe('John Doe');
    });

    it('should reject missing required fields', async () => {
      const app = new Hono();
      app.post('/users', jsonValidator(createUserSchema), async (c) => {
        const body = await c.req.json();
        return c.json({ success: true, data: body });
      });

      const res = await app.request('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'John Doe',
          // missing email
        }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as JsonApiErrorResponse;
      expect(body.errors).toBeDefined();
      expect(body.errors.length).toBeGreaterThan(0);
      expect(body.errors[0].code).toBe('validation_error');
    });

    it('should reject invalid email format', async () => {
      const app = new Hono();
      app.post('/users', jsonValidator(createUserSchema), async (c) => {
        const body = await c.req.json();
        return c.json({ success: true, data: body });
      });

      const res = await app.request('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'John Doe',
          email: 'not-an-email',
        }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as JsonApiErrorResponse;
      expect(body.errors[0].detail).toContain('email');
    });

    it('should reject empty name', async () => {
      const app = new Hono();
      app.post('/users', jsonValidator(createUserSchema), async (c) => {
        const body = await c.req.json();
        return c.json({ success: true, data: body });
      });

      const res = await app.request('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '',
          email: 'john@example.com',
        }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as JsonApiErrorResponse;
      expect(body.errors[0].meta?.field).toBe('name');
    });

    it('should return JSON:API formatted errors', async () => {
      const app = new Hono();
      app.post('/users', jsonValidator(createUserSchema), async (c) => {
        return c.json({ success: true });
      });

      const res = await app.request('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      expect(res.headers.get('Content-Type')).toContain('application/vnd.api+json');
      
      const body = (await res.json()) as JsonApiErrorResponse;
      expect(body.errors).toBeInstanceOf(Array);
      expect(body.errors[0]).toHaveProperty('code');
      expect(body.errors[0]).toHaveProperty('title');
      expect(body.errors[0]).toHaveProperty('detail');
      expect(body.errors[0]).toHaveProperty('status');
      expect(body.errors[0]).toHaveProperty('source');
      expect(body.errors[0]).toHaveProperty('meta');
    });
  });

  describe('queryValidator', () => {
    it('should validate query params with defaults', async () => {
      const app = new Hono();
      app.get('/items', queryValidator(paginationSchema), (c) => {
        const query = c.req.valid('query');
        return c.json(query);
      });

      const res = await app.request('/items');
      const body = (await res.json()) as PaginationResponse;

      expect(res.status).toBe(200);
      expect(body.page).toBe(1);
      expect(body.page_size).toBe(20);
    });

    it('should validate custom query params', async () => {
      const app = new Hono();
      app.get('/items', queryValidator(paginationSchema), (c) => {
        const query = c.req.valid('query');
        return c.json(query);
      });

      const res = await app.request('/items?page=2&page_size=50');
      const body = (await res.json()) as PaginationResponse;

      expect(res.status).toBe(200);
      expect(body.page).toBe(2);
      expect(body.page_size).toBe(50);
    });

    it('should reject invalid page_size exceeding max', async () => {
      const app = new Hono();
      app.get('/items', queryValidator(paginationSchema), (c) => {
        const query = c.req.valid('query');
        return c.json(query);
      });

      const res = await app.request('/items?page_size=200');

      expect(res.status).toBe(400);
    });
  });

  describe('paramValidator', () => {
    it('should validate URL params', async () => {
      const app = new Hono();
      app.get('/items/:id', paramValidator(idParamSchema), (c) => {
        const params = c.req.valid('param');
        return c.json(params);
      });

      const res = await app.request('/items/123');
      const body = (await res.json()) as IdResponse;

      expect(res.status).toBe(200);
      expect(body.id).toBe(123);
    });

    it('should reject invalid ID (negative)', async () => {
      const app = new Hono();
      app.get('/items/:id', paramValidator(idParamSchema), (c) => {
        const params = c.req.valid('param');
        return c.json(params);
      });

      const res = await app.request('/items/-1');

      expect(res.status).toBe(400);
    });

    it('should reject non-numeric ID', async () => {
      const app = new Hono();
      app.get('/items/:id', paramValidator(idParamSchema), (c) => {
        const params = c.req.valid('param');
        return c.json(params);
      });

      const res = await app.request('/items/abc');

      expect(res.status).toBe(400);
    });
  });

  describe('Zod schemas', () => {
    it('createUserSchema should validate correctly', () => {
      const valid = createUserSchema.safeParse({
        name: 'John Doe',
        email: 'john@example.com',
      });
      expect(valid.success).toBe(true);

      const invalid = createUserSchema.safeParse({
        name: '',
        email: 'invalid',
      });
      expect(invalid.success).toBe(false);
    });

    it('paginationSchema should have defaults', () => {
      const result = paginationSchema.parse({});
      expect(result.page).toBe(1);
      expect(result.page_size).toBe(20);
    });

    it('idParamSchema should coerce strings to numbers', () => {
      const result = idParamSchema.parse({ id: '42' });
      expect(result.id).toBe(42);
      expect(typeof result.id).toBe('number');
    });
  });
});
