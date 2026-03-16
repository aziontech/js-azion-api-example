/**
 * Stripe Webhook Handler
 *
 * Handles incoming webhooks from Stripe.
 * Registers all webhook events on webhook_event table for processing.
 */

import type { Context } from 'hono';
import type { AppEnv } from '../types';
import { getDB, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Stripe Event structure
 */
interface StripeEvent {
  id: string;
  object: 'event';
  type: string;
  data: {
    object: Record<string, unknown>;
  };
  created: number;
  livemode: boolean;
}

/**
 * Response for webhook endpoint
 */
interface WebhookResponse {
  success: boolean;
  message: string;
  eventId?: string;
  status?: 'received' | 'duplicate';
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * POST /webhooks/stripe
 *
 * Receives webhook events from Stripe and registers them on webhook_event table.
 * Implements idempotency by checking for existing stripe_event_id.
 */
export async function stripeWebhookHandler(c: Context<AppEnv>): Promise<Response> {
  const requestId = c.get('requestId') || 'unknown';
  const db = getDB();
  const { webhookEvents } = schema;

  try {
    // Parse the raw body
    const body = await c.req.json<StripeEvent>();

    console.log(`[${requestId}] Received Stripe webhook: ${body.type} (${body.id})`);

    // Validate required fields
    if (!body.id || !body.type || !body.object) {
      console.error(`[${requestId}] Invalid webhook payload: missing required fields`);
      return c.json<WebhookResponse>(
        {
          success: false,
          message: 'Invalid webhook payload: missing required fields',
        },
        400
      );
    }

    // Check for idempotency - has this event already been received?
    const existingEvent = await db
      .select({ id: webhookEvents.id })
      .from(webhookEvents)
      .where(eq(webhookEvents.stripeEventId, body.id))
      .limit(1);

    if (existingEvent.length > 0) {
      console.log(`[${requestId}] Webhook event already received: ${body.id}`);
      return c.json<WebhookResponse>(
        {
          success: true,
          message: 'Event already processed',
          eventId: existingEvent[0].id,
          status: 'duplicate',
        },
        200
      );
    }

    // Insert the webhook event
    const [insertedEvent] = await db
      .insert(webhookEvents)
      .values({
        stripeEventId: body.id,
        eventType: body.type,
        payload: body as unknown as Record<string, unknown>,
        status: 'pending',
      })
      .returning({ id: webhookEvents.id });

    console.log(`[${requestId}] Webhook event registered: ${body.id} -> ${insertedEvent.id}`);

    return c.json<WebhookResponse>(
      {
        success: true,
        message: 'Webhook event received',
        eventId: insertedEvent.id,
        status: 'received',
      },
      200
    );
  } catch (error) {
    console.error(`[${requestId}] Error processing webhook:`, error);

    // Check for unique constraint violation (duplicate event)
    if (error instanceof Error && error.message.includes('unique constraint')) {
      return c.json<WebhookResponse>(
        {
          success: true,
          message: 'Event already processed',
          status: 'duplicate',
        },
        200
      );
    }

    return c.json<WebhookResponse>(
      {
        success: false,
        message: 'Internal server error processing webhook',
      },
      500
    );
  }
}
