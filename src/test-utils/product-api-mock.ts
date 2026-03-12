/**
 * Product API Mock for Tests
 *
 * Provides a mock implementation of the Product API client for testing.
 * This allows tests to run without the actual Product API service.
 */

import type { PlanData } from '../clients/product-api';

/**
 * Mock plan data store
 *
 * Maps planId to plan data. Tests can add/remove plans as needed.
 */
const mockPlans = new Map<string, PlanData>();

/**
 * Re-export PlanData type for convenience
 */
export type { PlanData } from '../clients/product-api';

/**
 * Default test plan IDs
 */
export const TEST_PLAN_IDS = {
  free: '550e8400-e29b-41d4-a716-446655440000',
  paid: '660e8400-e29b-41d4-a716-446655440001',
  notFound: '00000000-0000-0000-0000-000000000000',
};

/**
 * Reset mock plans to default state
 *
 * Call this in beforeEach or at the start of tests to ensure
 * a clean state.
 */
export function resetMockPlans(): void {
  mockPlans.clear();
  
  // Add default test plans
  mockPlans.set(TEST_PLAN_IDS.free, {
    price_value: 0,
    type: 'free',
  });
  
  mockPlans.set(TEST_PLAN_IDS.paid, {
    price_value: 9900, // $99.00 in cents
    type: 'paid',
  });
}

/**
 * Add a mock plan
 *
 * @param planId - UUID of the plan
 * @param data - Plan data to return
 */
export function addMockPlan(planId: string, data: PlanData): void {
  mockPlans.set(planId, data);
}

/**
 * Remove a mock plan
 *
 * @param planId - UUID of the plan to remove
 */
export function removeMockPlan(planId: string): void {
  mockPlans.delete(planId);
}

/**
 * Get all mock plans (for debugging)
 */
export function getMockPlans(): ReadonlyMap<string, PlanData> {
  return mockPlans;
}

/**
 * Mock implementation of getPlanData
 *
 * This replaces the real Product API call during tests.
 *
 * @param planId - UUID of the plan to check
 * @returns Empty object {} if plan doesn't exist, or {price_value, type} if plan exists
 */
export async function mockGetPlanData(planId: string): Promise<PlanData | Record<string, never>> {
  const plan = mockPlans.get(planId);
  
  if (!plan) {
    return {}; // Plan not found
  }
  
  return { ...plan };
}

// Initialize with default plans
resetMockPlans();
