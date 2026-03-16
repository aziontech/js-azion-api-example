/**
 * Stripe API Mock for Tests
 *
 * Provides a mock implementation of the Stripe client for testing.
 * This allows tests to run without the actual Stripe service.
 */

/**
 * Mock checkout session response
 */
export interface MockCheckoutSession {
  id: string;
  object: 'checkout.session';
  mode: 'subscription';
  ui_mode: 'embedded';
  client_secret: string;
  status: 'open' | 'complete' | 'expired';
  metadata: Record<string, string>;
  created: number;
}

/**
 * Mock price response
 */
export interface MockPrice {
  id: string;
  object: 'price';
  unit_amount: number;
  currency: string;
  product: string;
  active: boolean;
  metadata: Record<string, string>;
}

/**
 * Track mock calls for assertions
 */
const mockCalls = {
  createPrice: [] as Array<{ productId: string; unitAmount: number; currency: string }>,
  createCheckoutSession: [] as Array<{ serviceOrderId: string }>,
};

/**
 * Get all mock calls (for assertions in tests)
 */
export function getMockCalls() {
  return {
    createPrice: [...mockCalls.createPrice],
    createCheckoutSession: [...mockCalls.createCheckoutSession],
  };
}

/**
 * Reset mock call tracking
 */
export function resetMockCalls(): void {
  mockCalls.createPrice = [];
  mockCalls.createCheckoutSession = [];
}

/**
 * Mock implementation of createPrice
 *
 * @param productId - Stripe product ID
 * @param unitAmount - Price in cents
 * @param currency - Currency code
 * @returns Mock price response
 */
export async function mockCreatePrice(
  productId: string,
  unitAmount: number,
  currency: string = 'usd'
): Promise<MockPrice> {
  mockCalls.createPrice.push({ productId, unitAmount, currency });

  return {
    id: `price_mock_${Date.now()}`,
    object: 'price',
    unit_amount: unitAmount,
    currency,
    product: productId,
    active: true,
    metadata: {},
  };
}

/**
 * Mock implementation of createCheckoutSession
 *
 * @param serviceOrderId - UUID of the service order
 * @returns Mock checkout session response with client_secret
 */
export async function mockCreateCheckoutSession(
  serviceOrderId: string
): Promise<MockCheckoutSession> {
  mockCalls.createCheckoutSession.push({ serviceOrderId });

  const timestamp = Date.now();
  const sessionId = `cs_test_${timestamp}`;

  return {
    id: sessionId,
    object: 'checkout.session',
    mode: 'subscription',
    ui_mode: 'embedded',
    client_secret: `${sessionId}_secret_${timestamp}`,
    status: 'open',
    metadata: {
      service_order_id: serviceOrderId,
    },
    created: Math.floor(timestamp / 1000),
  };
}

/**
 * Combined mock object for easy import
 */
export const stripeMock = {
  createPrice: mockCreatePrice,
  createCheckoutSession: mockCreateCheckoutSession,
  getCalls: getMockCalls,
  reset: resetMockCalls,
};
