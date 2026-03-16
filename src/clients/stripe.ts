/**
 * Stripe API Client
 *
 * Client for interacting with Stripe mock server.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { getEnv } from '../env.js';

/**
 * Stripe API Configuration
 */
export interface StripeApiConfig {
  baseUrl: string;
  timeout: number;
  apiKey: string;
}

/**
 * Get Stripe API configuration from environment
 */
export function getStripeApiConfig(): StripeApiConfig {
  return {
    baseUrl: getEnv('STRIPE_API_URL', 'http://localhost:12111'),
    timeout: parseInt(getEnv('STRIPE_API_TIMEOUT', '5000'), 10),
    apiKey: getEnv('STRIPE_API_KEY', 'sk_test_123'),
  };
}

/**
 * Get Stripe webhook secret from environment
 */
export function getStripeWebhookSecret(): string {
  return getEnv('STRIPE_WEBHOOK_SECRET', '');
}

// ---------------------------------------------------------------------------
// Webhook Signature Verification
// ---------------------------------------------------------------------------

/**
 * Parsed Stripe signature header
 */
interface StripeSignatureHeader {
  timestamp: number;
  signatures: string[];
}

/**
 * Parse the Stripe-Signature header
 *
 * Format: t=1234567890,v1=abc123...,v1=def456...
 *
 * @param header - The Stripe-Signature header value
 * @returns Parsed timestamp and signatures
 */
function parseSignatureHeader(header: string): StripeSignatureHeader | null {
  const parts = header.split(',');
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of parts) {
    const [prefix, value] = part.split('=');
    if (prefix === 't') {
      timestamp = parseInt(value, 10);
    } else if (prefix === 'v1') {
      signatures.push(value);
    }
  }

  if (timestamp === null || signatures.length === 0) {
    return null;
  }

  return { timestamp, signatures };
}

/**
 * Compute expected signature for webhook payload
 *
 * @param timestamp - Unix timestamp from Stripe-Signature header
 * @param payload - Raw request body as string
 * @param secret - Stripe webhook signing secret
 * @returns Hex-encoded signature
 */
function computeSignature(timestamp: number, payload: string, secret: string): string {
  const signedPayload = `${timestamp}.${payload}`;
  const hmac = createHmac('sha256', secret);
  hmac.update(signedPayload);
  return hmac.digest('hex');
}

/**
 * Verify Stripe webhook signature
 *
 * Validates that the webhook request genuinely came from Stripe by verifying
 * the signature using the webhook signing secret.
 *
 * @param payload - Raw request body as string
 * @param signatureHeader - The Stripe-Signature header value
 * @param secret - Stripe webhook signing secret (optional, defaults to env var)
 * @param tolerance - Maximum age of webhook in seconds (default: 300 = 5 minutes)
 * @returns true if signature is valid, false otherwise
 */
export function verifyStripeSignature(
  payload: string,
  signatureHeader: string,
  secret?: string,
  tolerance: number = 300
): boolean {
  const webhookSecret = secret ?? getStripeWebhookSecret();

  if (!webhookSecret) {
    console.error('[Stripe] No webhook secret configured');
    return false;
  }

  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) {
    console.error('[Stripe] Invalid signature header format');
    return false;
  }

  // Check timestamp is within tolerance
  const now = Math.floor(Date.now() / 1000);
  const age = now - parsed.timestamp;
  if (age > tolerance) {
    console.error(`[Stripe] Webhook timestamp too old: ${age}s (tolerance: ${tolerance}s)`);
    return false;
  }

  // Compute expected signature
  const expectedSignature = computeSignature(parsed.timestamp, payload, webhookSecret);

  // Compare signatures using timing-safe comparison
  for (const signature of parsed.signatures) {
    try {
      // Both signatures need to be same length for timingSafeEqual
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');
      const actualBuffer = Buffer.from(signature, 'hex');

      if (expectedBuffer.length === actualBuffer.length) {
        if (timingSafeEqual(expectedBuffer, actualBuffer)) {
          return true;
        }
      }
    } catch {
      // Invalid hex encoding, continue to next signature
      continue;
    }
  }

  return false;
}

/**
 * Price creation request
 */
export interface CreatePriceRequest {
  amount: number;
  currency?: string;
  productId?: string;
}

/**
 * Price response from Stripe API
 */
export interface PriceResponse {
  id: string;
  object: string;
  active: boolean;
  billing_scheme: string;
  created: number;
  currency: string;
  custom_unit_amount: null | unknown;
  livemode: boolean;
  lookup_key: null | string;
  metadata: Record<string, unknown>;
  migrate_to: null | unknown;
  nickname: null | string;
  product: string;
  recurring: null | {
    aggregate_usage: string | null;
    interval: string;
    interval_count: number;
    meter: unknown | null;
    trial_period_days: number | null;
    usage_type: string;
  };
  tax_behavior: string;
  tiers: unknown[];
  tiers_mode: null | string;
  transform_quantity: null | unknown;
  type: string;
  unit_amount: number;
  unit_amount_decimal: string;
}

/**
 * Create a price in Stripe
 *
 * @param amount - The price amount in cents (e.g., 1000 = $10.00)
 * @param currency - The currency code (default: 'usd')
 * @param productId - Optional product ID to associate the price with
 * @returns The created price object
 * @throws Error if the API request fails
 */
export async function createPrice(
  amount: number,
  currency: string = 'usd',
  productId?: string
): Promise<PriceResponse> {
  const config = getStripeApiConfig();

  // Build form data for Stripe API (it expects form-urlencoded)
  const formData = new URLSearchParams();
  formData.append('unit_amount', String(amount));
  formData.append('currency', currency);
  formData.append('recurring[interval]', 'month');

  if (productId) {
    formData.append('product', productId);
  }

  const url = `${config.baseUrl}/v1/prices`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeout);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: formData.toString(),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Stripe API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = (await response.json()) as PriceResponse;
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Stripe API timeout after ${config.timeout}ms`);
    }
    throw error;
  }
}

/**
 * Checkout Session response from Stripe API
 */
export interface CheckoutSessionResponse {
  id: string;
  object: string;
  after_expiration: null | unknown;
  allow_promotion_codes: boolean | null;
  amount_subtotal: number | null;
  amount_total: number | null;
  automatic_tax: {
    enabled: boolean;
    status: string | null;
  };
  billing_address_collection: string | null;
  cancel_url: string | null;
  client_secret: string;
  client_reference_id: string | null;
  consent: unknown | null;
  consent_collection: unknown | null;
  created: number;
  currency: string | null;
  custom_fields: unknown[];
  custom_text: unknown | null;
  customer: string | null;
  customer_creation: string | null;
  customer_details: unknown | null;
  customer_email: string | null;
  expires_at: number | null;
  invoice: string | null;
  invoice_creation: unknown | null;
  livemode: boolean;
  locale: string | null;
  metadata: Record<string, string>;
  mode: string;
  payment_intent: string | null;
  payment_link: string | null;
  payment_method_collection: string;
  payment_method_configuration_details: unknown | null;
  payment_method_options: unknown | null;
  payment_status: string;
  phone_number_collection: unknown | null;
  recovered_from: string | null;
  return_url: string | null;
  saved_payment_method_options: unknown | null;
  setup_future_usage: string | null;
  shipping: unknown | null;
  shipping_address_collection: unknown | null;
  shipping_options: unknown[];
  submit_type: string | null;
  subscription: string | null;
  subscription_data: unknown | null;
  success_url: string | null;
  total_details: {
    amount_discount: number;
    amount_shipping: number;
    amount_tax: number;
  } | null;
  ui_mode: string;
  url: string | null;
}

/**
 * Create a checkout session in Stripe
 *
 * @param serviceOrderId - The service order ID to associate with this session
 * @param priceId - The Stripe price ID (default: 'price_QMnYdaWuj2u0MUw')
 * @param quantity - The quantity (default: 1)
 * @returns The created checkout session object with client_secret
 * @throws Error if the API request fails
 */
export async function createCheckoutSession(
  serviceOrderId: string,
  priceId: string = 'price_QMnYdaWuj2u0MUw',  // Hardcoded for now. Will be updated once products-api supply this info
  quantity: number = 1
): Promise<CheckoutSessionResponse> {
  const config = getStripeApiConfig();

  // Build form data for Stripe API (it expects form-urlencoded)
  const formData = new URLSearchParams();
  formData.append('mode', 'subscription');
  formData.append('metadata[service_order_id]', serviceOrderId);
  formData.append('line_items[0][price]', priceId);
  formData.append('line_items[0][quantity]', String(quantity));
  formData.append('ui_mode', 'embedded');
  formData.append('return_url', 'http://localhost:3000/webhooks/stripe');  // Note: need to make this dynamic for dev, stage and prod environments

  const url = `${config.baseUrl}/v1/checkout/sessions`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeout);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: formData.toString(),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Stripe API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = (await response.json()) as CheckoutSessionResponse;
    console.log('[Stripe] Checkout session response:', JSON.stringify(data, null, 2));
    
    // In development mode (SSO_MODE=development), stripe-mock returns client_secret: null
    // We inject a fake client_secret for local development testing
    const ssoMode = getEnv('SSO_MODE', 'production');
    if (ssoMode === 'development' && !data.client_secret) {
      data.client_secret = `${data.id}_secret_${Date.now()}`;
      console.log('[Stripe] Injected client_secret for development mode');
    }
    
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Stripe API timeout after ${config.timeout}ms`);
    }
    throw error;
  }
}
