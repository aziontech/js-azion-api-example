/**
 * Azion Edge Functions Entry Point
 *
 * This file wraps the Hono application for deployment on Azion Edge Functions.
 * It uses the Service Worker API pattern (addEventListener('fetch')).
 *
 * Build command:
 * ```bash
 * bun build src/azion.ts --outfile=dist/azion.js --target=browser --minify
 * ```
 *
 * @see https://www.azion.com/en/documentation/products/build/edge-application/edge-functions/
 */

// Import types for Azion globals
import './azion.d.ts';

// Import the Hono application
import app from './index.ts';

// Import args management
import { setAzionArgs } from './env.ts';

/**
 * Handle incoming fetch events
 */
addEventListener('fetch', (event: FetchEvent) => {
  // Extract args from event and store globally
  // Args are passed via FetchEvent.args in Azion Edge Functions
  const eventAny = event as any;
  if (eventAny.args && typeof eventAny.args === 'object') {
    setAzionArgs(eventAny.args);
  }

  event.respondWith(handleRequest(event));
});

/**
 * Process the incoming request through Hono
 *
 * @param event - The FetchEvent from Azion runtime
 * @returns Promise<Response> - The HTTP response
 */
async function handleRequest(event: FetchEvent): Promise<Response> {
  try {
    return await app.fetch(event.request);
  } catch (error) {
    console.error('[Edge Function] Unhandled error:', error);

    return new Response(
      JSON.stringify({
        errors: [
          {
            code: 'edge_function_error',
            title: 'Edge Function Error',
            detail: 'An unexpected error occurred while processing the request.',
            status: '500',
          },
        ],
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/vnd.api+json' },
      }
    );
  }
}
