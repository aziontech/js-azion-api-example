/**
 * Stripe Webhook Handler
 *
 * Handles incoming webhooks from Stripe.
 * Registers all webhook events on webhook_event table for processing.
 *
 * In non-development environments (SSO_MODE != 'development'), validates
 * Stripe signature to ensure webhooks are genuinely from Stripe.
 */

import type { Context } from 'hono';
import type { AppEnv } from '../types';
import { getDB, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { getEnv } from '../env.js';
import { verifyStripeSignature } from '../clients/stripe.js';

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
 * Stripe Checkout Session object (simplified for webhook handling)
 */
interface StripeCheckoutSession {
  id: string;
  object: 'checkout.session';
  metadata: Record<string, string>;
  payment_status: string;
  status: string;
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
 *
 * In non-development environments, validates Stripe signature.
 */
export async function stripeWebhookHandler(c: Context<AppEnv>): Promise<Response> {
  const requestId = c.get('requestId') || 'unknown';
  const ssoMode = getEnv('SSO_MODE', 'production');
  const isDevelopment = ssoMode === 'development';

  try {
    // Get raw body for signature verification
    const rawBody = await c.req.text();

    // In non-development environments, verify Stripe signature
    if (!isDevelopment) {
      const signatureHeader = c.req.header('Stripe-Signature');

      if (!signatureHeader) {
        console.error(`[${requestId}] Missing Stripe-Signature header`);
        return c.json<WebhookResponse>(
          {
            success: false,
            message: 'Missing Stripe-Signature header',
          },
          400
        );
      }

      const isValidSignature = verifyStripeSignature(rawBody, signatureHeader);

      if (!isValidSignature) {
        console.error(`[${requestId}] Invalid Stripe signature`);
        return c.json<WebhookResponse>(
          {
            success: false,
            message: 'Invalid signature',
          },
          400
        );
      }

      console.log(`[${requestId}] Stripe signature verified successfully`);
    }

    // Parse the body as JSON
    let body: StripeEvent;
    try {
      body = JSON.parse(rawBody) as StripeEvent;
    } catch (parseError) {
      console.error(`[${requestId}] Invalid JSON payload:`, parseError);
      return c.json<WebhookResponse>(
        {
          success: false,
          message: 'Invalid JSON payload',
        },
        400
      );
    }

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

    const db = getDB();
    const { webhookEvents } = schema;

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

    // Handle checkout.session.completed - activate the service order
    if (body.type === 'checkout.session.completed') {
      const session = body.data.object as unknown as StripeCheckoutSession;
      const serviceOrderId = session.metadata?.service_order_id;

      if (!serviceOrderId) {
        // Missing service_order_id - mark webhook as failed
        console.warn(`[${requestId}] checkout.session.completed event missing service_order_id in metadata`);
        await db
          .update(webhookEvents)
          .set({
            status: 'failed',
            errorMessage: 'Missing service_order_id in checkout.session metadata',
            updatedAt: new Date(),
          })
          .where(eq(webhookEvents.id, insertedEvent.id));
      } else {
        console.log(`[${requestId}] Processing checkout.session.completed for service order: ${serviceOrderId}`);

        const { serviceOrders } = schema;

        // Update service order status from DRAFT to ACTIVE
        const updatedOrders = await db
          .update(serviceOrders)
          .set({
            status: 'ACTIVE',
            updatedAt: new Date(),
          })
          .where(eq(serviceOrders.serviceOrderId, serviceOrderId))
          .returning();

        const updatedOrder = Array.isArray(updatedOrders) ? updatedOrders[0] : (updatedOrders as any).rows?.[0];

        if (updatedOrder) {
          console.log(`[${requestId}] Service order ${serviceOrderId} activated successfully`);
        } else {
          // Service order not found - mark webhook as failed
          console.warn(`[${requestId}] Service order ${serviceOrderId} not found for activation`);
          await db
            .update(webhookEvents)
            .set({
              status: 'failed',
              errorMessage: `Service order ${serviceOrderId} not found`,
              updatedAt: new Date(),
            })
            .where(eq(webhookEvents.id, insertedEvent.id));
        }
      }
    }

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
