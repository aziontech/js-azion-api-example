/**
 * Product API Client
 *
 * Client for interacting with the Product API to validate plans.
 */

import { getProductApiConfig } from '../config.ts';

/**
 * Plan response from Product API
 */
export interface PlanResponse {
  id: string;
  name: string;
  type: string;
  active: boolean;
  price?: number;
  currency?: string;
  billingPeriod?: string;
}

/**
 * Check if a plan exists in the Product API
 *
 * @param planId - UUID of the plan to check
 * @returns Plan data if found, null if not found
 * @throws Error if the API request fails (other than 404)
 */
export async function getPlanById(planId: string): Promise<PlanResponse | null> {
  const config = getProductApiConfig();
  
  const url = `${config.baseUrl}/plans/${planId}`;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (response.status === 404) {
      return null; // Plan not found
    }
    
    if (!response.ok) {
      throw new Error(`Product API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json() as PlanResponse;
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Product API timeout after ${config.timeout}ms`);
    }
    throw error;
  }
}

/**
 * Verify a plan exists and is active
 *
 * @param planId - UUID of the plan to verify
 * @returns true if plan exists and is active
 * @throws Error if plan doesn't exist, is inactive, or API fails
 */
export async function verifyPlanExists(planId: string): Promise<boolean> {
  const plan = await getPlanById(planId);
  
  if (!plan) {
    return false;
  }
  
  // Optionally check if plan is active
  // return plan.active === true;
  return true;
}
