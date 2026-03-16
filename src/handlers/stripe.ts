/**
 * Stripe Handlers
 *
 * Endpoints for interacting with Stripe API.
 */

import type { Context } from 'hono';
import { createPrice } from '../clients/stripe.js';
import type { AppEnv } from '../types.ts';

/**
 * Request body for creating a price
 */
interface CreatePriceBody {
  amount: number;
  currency?: string;
  productId?: string;
}

/**
 * POST /api/v1/stripe/prices
 *
 * Create a new price in Stripe.
 * Requires authentication.
 *
 * Request body:
 *   - amount: number (required) - Price amount in cents (e.g., 1000 = $10.00)
 *   - currency: string (optional) - Currency code (default: 'usd')
 *   - productId: string (optional) - Product ID to associate the price with
 */
export async function createPriceHandler(c: Context<AppEnv>) {
  const requestId = c.get('requestId');

  try {
    // Parse request body
    const body = await c.req.json<CreatePriceBody>();

    // Validate amount is provided and is a positive number
    if (typeof body.amount !== 'number' || body.amount <= 0) {
      return c.json(
        {
          success: false,
          error: 'Invalid amount',
          message: 'Amount must be a positive number (in cents)',
          meta: { requestId },
        },
        400
      );
    }

    // Get auth info for logging
    const auth = c.get('auth');
    console.log(
      `[${requestId}] User ${auth.user?.email} creating price with amount: ${body.amount}`
    );

    // Create price in Stripe
    const price = await createPrice(
      body.amount,
      body.currency || 'usd',
      body.productId
    );

    return c.json(
      {
        success: true,
        data: price,
        meta: { requestId },
      },
      201
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${requestId}] Error creating price:`, message);

    return c.json(
      {
        success: false,
        error: 'Failed to create price',
        message,
        meta: { requestId },
      },
      500
    );
  }
}
