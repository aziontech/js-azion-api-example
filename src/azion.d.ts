/**
 * Azion Edge Functions Global Type Declarations
 *
 * These types define the global objects and functions available in the
 * Azion Edge Functions runtime environment.
 *
 * @see https://www.azion.com/en/documentation/products/build/edge-application/edge-functions/
 */

declare global {
  /**
   * Azion runtime environment object
   * Provides access to environment variables and platform-specific features
   */
  const Azion: {
    /**
     * Environment variables accessor
     */
    env: {
      /**
       * Get an environment variable value
       * @param key - The environment variable name
       * @returns The value or undefined if not set
       */
      get(key: string): string | undefined;
    };
  };

  /**
   * FetchEvent interface for Azion Edge Functions
   * Represents an incoming HTTP request event
   */
  interface FetchEvent extends Event {
    /**
     * The incoming HTTP request
     */
    readonly request: Request;

    /**
     * Respond to the request with the given response
     * @param response - The response or a promise resolving to a response
     */
    respondWith(response: Response | Promise<Response>): void;

    /**
     * Extend the lifetime of the event to perform background tasks
     * @param promise - A promise representing the background work
     */
    waitUntil(promise: Promise<unknown>): void;

    /**
     * The client information (IP, geo, etc.)
     */
    readonly client?: {
      readonly address: string;
      readonly geo?: {
        readonly city?: string;
        readonly country?: string;
        readonly region?: string;
      };
    };
  }

  /**
   * Add an event listener for fetch events (Azion Edge Functions entry point)
   * @param type - Must be 'fetch'
   * @param listener - The event handler function
   */
  function addEventListener(
    type: 'fetch',
    listener: (event: FetchEvent) => void
  ): void;

  /**
   * FirewallEvent interface for Azion Edge Firewall
   * Represents an incoming request event in the firewall context
   */
  interface FirewallEvent extends Event {
    readonly request: Request;
    respondWith(response: Response | Promise<Response>): void;
    waitUntil(promise: Promise<unknown>): void;
    deny(): void;
    drop(): void;
    continue(): void;
  }

  /**
   * Add an event listener for firewall events (Azion Edge Firewall)
   */
  function addEventListener(
    type: 'firewall',
    listener: (event: FirewallEvent) => void
  ): void;
}

export {};
