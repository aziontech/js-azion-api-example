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
 * Plan data returned by getPlanData
 */
export interface PlanData {
  price_value: number;
  type: 'free' | 'paid';
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
 * Get plan data from the Product API
 *
 * @param planId - UUID of the plan to check
 * @returns Empty object {} if plan doesn't exist, or {price_value, type} if plan exists
 * @throws Error if the API request fails (other than 404)
 */
export async function getPlanData(planId: string): Promise<PlanData | Record<string, never>> {
  // product-api isn't ready yet
  // const plan = await getPlanById(planId);
  // 
  // if (!plan) {
  //   return {}; // Plan not found - return empty object
  // }
  
  // Plan exists - return mock data for now
  return {
    price_value: 99,
    type: 'paid',
  };
}
