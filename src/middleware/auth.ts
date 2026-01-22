/**
 * Authentication middleware for the example API
 *
 * Uses @azion/js-auth to validate requests and injects user/account data
 * into the Hono context.
 *
 * Like edge-api, this middleware:
 * 1. Validates session cookie or API token
 * 2. Checks if the account is a "client" type
 * 3. Injects auth result into context via c.set('auth', ...)
 */

import { createMiddleware } from 'hono/factory';
import { AzionAuth, AUTH_ERROR_CODES, type AzionAuthConfig } from '@azion/js-auth';
import { globalCodes } from '@azion/js-api-errors';
import { config } from '../config.ts';
import { isAzionRuntime } from '../env.ts';
import type { AppEnv } from '../types.ts';

/**
 * Create the AzionAuth instance (singleton)
 */
let _authInstance: AzionAuth | null = null;
let _authConfiguredWithArgs = false;

function getAuthInstance(): AzionAuth {
  // In Azion Edge, args are only available after first request
  // If we created auth before args were available, recreate it
  const hasArgs = isAzionRuntime();
  if (_authInstance && !_authConfiguredWithArgs && hasArgs) {
    _authInstance = null;
  }

  if (!_authInstance) {
    const cfg = config();
    const authConfig: AzionAuthConfig = {
      mode: cfg.mode,
      gqlSecret: cfg.gqlSecret,
      jwtPublicKey: cfg.jwtPublicKey,
    };
    _authInstance = new AzionAuth(authConfig);
    _authConfiguredWithArgs = hasArgs;
  }
  return _authInstance;
}

/**
 * Create a JSON:API error response
 */
function jsonApiError(
  code: string,
  title: string,
  detail: string,
  status: number,
  source?: { header?: string; pointer?: string }
) {
  return {
    errors: [
      {
        code,
        title,
        detail,
        status: String(status),
        ...(source && { source }),
      },
    ],
  };
}

/**
 * Azion Authentication Middleware
 *
 * Validates the request authentication and checks for client account type.
 * On success, sets `auth` in context. On failure, returns JSON:API error.
 */
export const azionAuthMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const auth = getAuthInstance();
  const request = c.req.raw;

  // Authenticate the request
  const authResult = await auth.authenticate(request);

  // Check if authenticated
  if (!authResult.authenticated) {
    const error = authResult.error;

    // Determine the source based on request headers
    let source: { header?: string } | undefined;
    if (request.headers.has('Authorization')) {
      source = { header: 'Authorization' };
    } else if (request.headers.has('Cookie')) {
      source = { header: 'Cookie' };
    }

    // Check if it's a permission/policy error (403) or auth error (401)
    if (
      error?.code === AUTH_ERROR_CODES.ACCESS_DENIED_BY_POLICY ||
      error?.code === AUTH_ERROR_CODES.PERMISSION_DENIED ||
      error?.code === AUTH_ERROR_CODES.ACCOUNT_INACTIVE ||
      error?.code === AUTH_ERROR_CODES.USER_INACTIVE
    ) {
      return c.json(
        jsonApiError(
          globalCodes.PERMISSION_DENIED,
          'Forbidden',
          error?.message || 'Access denied',
          403,
          source
        ),
        403,
        { 'Content-Type': 'application/vnd.api+json' }
      );
    }

    return c.json(
      jsonApiError(
        globalCodes.NOT_AUTHENTICATED,
        'Not Authenticated',
        error?.message || 'Authentication credentials were not provided.',
        401,
        source
      ),
      401,
      { 'Content-Type': 'application/vnd.api+json' }
    );
  }

  // Check if user is active
  if (!authResult.user?.isActive) {
    return c.json(
      jsonApiError(
        globalCodes.PERMISSION_DENIED,
        'User Inactive',
        'Your user account is inactive.',
        403
      ),
      403,
      { 'Content-Type': 'application/vnd.api+json' }
    );
  }

  // Check if account exists
  if (!authResult.account) {
    return c.json(
      jsonApiError(
        globalCodes.PERMISSION_DENIED,
        'Account Required',
        'Account information not available.',
        403
      ),
      403,
      { 'Content-Type': 'application/vnd.api+json' }
    );
  }

  // Check if it's a client account type (like ClientRequiredMixin)
  if (authResult.account.accountType !== 'client') {
    return c.json(
      jsonApiError(
        globalCodes.PERMISSION_DENIED,
        'Client Account Required',
        'Only client accounts are allowed to access this resource.',
        403,
        { pointer: '/data/attributes/account_type' }
      ),
      403,
      { 'Content-Type': 'application/vnd.api+json' }
    );
  }

  // Check if clientId exists
  if (!authResult.account.clientId) {
    return c.json(
      jsonApiError(
        globalCodes.PERMISSION_DENIED,
        'Client ID Required',
        'Client ID not found in account.',
        403
      ),
      403,
      { 'Content-Type': 'application/vnd.api+json' }
    );
  }

  // Authentication successful - inject auth into context
  c.set('auth', authResult);
  await next();
});
