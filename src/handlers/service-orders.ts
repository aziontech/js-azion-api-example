/**
 * Service Orders Handlers
 *
 * Endpoints for managing service orders.
 * All endpoints require authentication.
 */

import type { Context } from 'hono';
import { eq, desc, and, sql } from 'drizzle-orm';
import { getDB, isDatabaseAvailable, schema } from '../db/index.js';
import type { AppEnv } from '../types.ts';
import type { ServiceOrder, NewServiceOrder } from '../db/schema.ts';
import type { createServiceOrderSchema } from '../middleware/validation.ts';
import type { z } from 'zod';
import { getPlanData } from '../clients/product-api.ts';

/**
 * Inferred type from the Zod schema
 */
type CreateServiceOrderInput = z.infer<typeof createServiceOrderSchema>;

/**
 * Service Order Status type from database schema
 */
type ServiceOrderStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'BLOCKED'
  | 'CANCELED'
  | 'EXPIRED';

/**
 * Service Order Type from database schema
 */
type ServiceOrderType = 'plan_subscription';

/**
 * List query parameters
 */
interface ListQueryParams {
  limit?: number;
  offset?: number;
  status?: ServiceOrderStatus;
  type?: ServiceOrderType;
  accountId?: number;
}

/**
 * GET /service-orders
 *
 * Lists all service orders with optional filtering.
 * Requires authentication.
 *
 * Query params:
 *   - limit: number of records to return (default: 20, max: 100)
 *   - offset: number of records to skip (default: 0)
 *   - status: filter by status (DRAFT, ACTIVE, PAST_DUE, BLOCKED, CANCELED, EXPIRED)
 *   - type: filter by type (plan_subscription)
 *   - accountId: filter by account ID
 */
export async function listServiceOrdersHandler(c: Context<AppEnv>) {
  const requestId = c.get('requestId');

  // Check if database is configured
  if (!isDatabaseAvailable()) {
    return c.json(
      {
        success: false,
        error: 'Database not configured',
        message: 'Database environment variables are not set',
        meta: { requestId },
      },
      503
    );
  }

  try {
    const db = getDB();

    // Get auth info for logging
    const auth = c.get('auth');
    console.log(
      `[${requestId}] User ${auth.user?.email} listing service orders`
    );

    // Parse query parameters
    const url = new URL(c.req.url);
    const params: ListQueryParams = {
      limit: Math.min(
        parseInt(url.searchParams.get('limit') || '20', 10),
        100
      ),
      offset: parseInt(url.searchParams.get('offset') || '0', 10),
      status: url.searchParams.get('status') as ServiceOrderStatus | undefined,
      type: url.searchParams.get('type') as ServiceOrderType | undefined,
      accountId: url.searchParams.get('accountId')
        ? parseInt(url.searchParams.get('accountId')!, 10)
        : undefined,
    };

    // Build query with filters
    const { serviceOrders } = schema;

    // Build where conditions
    const conditions = [];

    if (params.status) {
      conditions.push(eq(serviceOrders.status, params.status));
    }

    if (params.type) {
      conditions.push(eq(serviceOrders.type, params.type));
    }

    if (params.accountId) {
      conditions.push(eq(serviceOrders.accountId, params.accountId));
    }

    // Execute query with filters
    const orders = await db
      .select()
      .from(serviceOrders)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(serviceOrders.createdAt))
      .limit(params.limit!)
      .offset(params.offset!);

    // Get total count for pagination
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(serviceOrders)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = Number(countResult[0]?.count || 0);

    return c.json({
      success: true,
      data: orders,
      meta: {
        count: orders.length,
        total,
        limit: params.limit,
        offset: params.offset,
        requestId,
      },
    });
  } catch (error) {
    console.error(`[${requestId}] Error listing service orders:`, error);
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
 * GET /service-orders/:id
 *
 * Get a single service order by UUID.
 * Requires authentication.
 */
export async function getServiceOrderHandler(c: Context<AppEnv>) {
  const requestId = c.get('requestId');

  // Check if database is configured
  if (!isDatabaseAvailable()) {
    return c.json(
      {
        success: false,
        error: 'Database not configured',
        message: 'Database environment variables are not set',
        meta: { requestId },
      },
      503
    );
  }

  try {
    const db = getDB();
    const orderId = c.req.param('id');

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!orderId || !uuidRegex.test(orderId)) {
      return c.json(
        {
          success: false,
          error: 'Invalid ID',
          message: 'Service order ID must be a valid UUID',
          meta: { requestId },
        },
        400
      );
    }

    // Get auth info for logging
    const auth = c.get('auth');
    console.log(
      `[${requestId}] User ${auth.user?.email} retrieving service order ${orderId}`
    );

    const { serviceOrders } = schema;

    // Query service order
    const [order] = await db
      .select()
      .from(serviceOrders)
      .where(eq(serviceOrders.serviceOrderId, orderId))
      .limit(1);

    if (!order) {
      return c.json(
        {
          success: false,
          error: 'Not found',
          message: `Service order with ID ${orderId} not found`,
          meta: { requestId },
        },
        404
      );
    }

    return c.json({
      success: true,
      data: order,
      meta: { requestId },
    });
  } catch (error) {
    console.error(`[${requestId}] Error getting service order:`, error);
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
 * POST /service-orders
 *
 * Creates a new service order in the database.
 * Requires authentication.
 *
 * Body (validated by Zod middleware):
 *   - accountId: number (required, positive integer)
 *   - planId: string UUID (required)
 *
 * Other fields are set programmatically:
 *   - type: 'plan_subscription' (default)
 *   - status: 'ACTIVE' (default)
 *   - ip, port, timezone: extracted from request context (Marco Civil compliance)
 *   - timestamps: database defaults
 */
export async function createServiceOrderHandler(c: Context<AppEnv>) {
  const requestId = c.get('requestId');

  // Check if database is configured
  if (!isDatabaseAvailable()) {
    return c.json(
      {
        success: false,
        error: 'Database not configured',
        message: 'Database environment variables are not set',
        meta: { requestId },
      },
      503
    );
  }

  try {
    // Get validated data from Zod middleware
    const body = (await c.req.json()) as CreateServiceOrderInput;

    // Get auth info for logging
    const auth = c.get('auth');
    console.log(
      `[${requestId}] User ${auth.user?.email} creating service order for account ${body.accountId}`
    );

    // Verify that the plan exists in Product API, and get plan data
    console.log(`[${requestId}] Fetching plan data for ${body.planId} from Product API`);
    const planData = await getPlanData(body.planId);
    
    // Check if plan exists (empty object means not found)
    if (Object.keys(planData).length === 0) {
      return c.json(
        {
          success: false,
          error: 'Invalid plan',
          message: `Plan with ID ${body.planId} not found`,
          meta: { requestId },
        },
        400
      );
    }
    
    console.log(`[${requestId}] Plan ${body.planId} found:`, planData);

    const db = getDB();
    const { serviceOrders } = schema;

    // Extract client connection info for Marco Civil compliance
    // These should be set by the upstream proxy/load balancer
    const clientIp = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
      || c.req.header('x-real-ip')
      || '127.0.0.1';
    const clientPort = parseInt(c.req.header('x-forwarded-port') || '0', 10);
    const clientIpFwd = c.req.header('x-forwarded-for')?.split(',')[1]?.trim() || null;
    const clientPortFwd = null; // Usually not available
    const clientTimezone = c.req.header('x-timezone') || 'America/Sao_Paulo';

    // Prepare insert data with programmatic values
    const insertData: NewServiceOrder = {
      // Client-provided fields
      accountId: body.accountId,
      planId: body.planId,
      
      // Programmatically set fields
      type: 'plan_subscription',
      status: 'ACTIVE',
      gatewayId: null, // Set later when payment gateway is integrated
      
      // Dates - set later during activation
      startDate: null,
      endDate: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      
      // Auto-renewal default
      autoRenew: true,
      
      // Marco Civil da Internet - audit fields from request context
      ip: clientIp,
      port: clientPort,
      ipFwd: clientIpFwd,
      portFwd: clientPortFwd,
      timezone: clientTimezone,
      
      // Metadata (empty for now, can be enriched later)
      metadata: {},
      
      // lastEditor from auth context
      lastEditor: auth.user?.email ?? 'unknown',
    };

    // Insert new service order
    const result = await db
      .insert(serviceOrders)
      .values(insertData)
      .returning();

    // Handle both postgres-js (array) and AWS Data API (object with rows) results
    const newOrder = Array.isArray(result) ? result[0] : (result as any).rows?.[0];

    return c.json(
      {
        success: true,
        data: newOrder,
        message: 'Service order created successfully',
        meta: {
          requestId,
        },
      },
      201
    );
  } catch (error) {
    console.error(`[${requestId}] Error creating service order:`, error);
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
