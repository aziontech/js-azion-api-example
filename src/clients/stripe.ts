/**
 * Stripe API Client
 *
 * Client for interacting with Stripe mock server.
 */

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
