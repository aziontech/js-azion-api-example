# @azion/example-api

Example REST API using `@azion/js-auth` and `@azion/js-api-errors` - Hono + TypeScript

This project demonstrates how to build a production-ready REST API for Azion Edge Functions using:

- **[@azion/js-auth](./js-azion-auth/)** - Authentication library for Azion SSO
- **[@azion/js-api-errors](./js-azion-api-errors/)** - Error handling following JSON:API specification
- **[Hono](https://hono.dev/)** - Lightweight web framework
- **[Drizzle ORM](https://orm.drizzle.team/)** - TypeScript ORM for database access
- **[Zod](https://zod.dev/)** - Schema validation

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [API Endpoints](#api-endpoints)
- [Authentication](#authentication)
- [Error Handling](#error-handling)
- [Development](#development)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Related Libraries](#related-libraries)

---

## Features

- SSO Authentication via session cookies and API tokens
- JSON:API compliant error responses
- Request validation with Zod schemas
- Security middlewares (CORS, secure headers, body limit, timeout)
- Request ID tracing for debugging
- Database integration with AWS RDS Data API
- Runs on both Azion Edge Functions and Bun

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) >= 1.0
- [Azion CLI](https://www.azion.com/en/documentation/products/azion-cli/overview/) (for deployment)

### Installation

```bash
# Clone the repository
git clone --recurse-submodules git@github.com:aziontech/js-azion-api-example.git
cd js-azion-api-example

# Install dependencies
bun install

# Copy environment file
cp .env.example .env
# Edit .env with your credentials
```

### Environment Variables

```env
# SSO Authentication
SSO_MODE=stage                    # development | stage | production
SSO_GQL_SECRET=your_secret_here   # Required for stage/production

# AWS RDS Data API (optional)
RDS_REGION=us-east-1
RDS_RESOURCE_ARN=arn:aws:rds:...
RDS_SECRET_ARN=arn:aws:secretsmanager:...
RDS_DATABASE=your_database
```

### Run Locally

```bash
# Development server (Bun)
bun run dev
# Server running at http://localhost:3000

# Edge Runtime simulation (Azion)
bun run dev:azion
# Server running at http://localhost:3333
```

---

## Project Structure

```
js-azion-api-example/
├── src/
│   ├── index.ts           # Hono app configuration
│   ├── azion.ts           # Edge Functions entry point
│   ├── server.ts          # Bun development server
│   ├── config.ts          # SSO/Auth configuration
│   ├── env.ts             # Environment variable management
│   ├── types.ts           # TypeScript types
│   ├── handlers/          # Route handlers
│   │   ├── health.ts      # Health check endpoints
│   │   ├── tasks.ts       # Tasks CRUD
│   │   └── db-test.ts     # Database test endpoints
│   ├── middleware/        # Hono middlewares
│   │   ├── auth.ts        # Authentication middleware
│   │   ├── security.ts    # Security middlewares
│   │   └── validation.ts  # Request validation
│   └── db/                # Database layer
│       ├── config.ts      # RDS configuration
│       ├── index.ts       # Database client
│       └── schema.ts      # Drizzle schema
├── js-azion-auth/         # Authentication library (submodule)
├── js-azion-api-errors/   # Error handling library (submodule)
├── azion/                 # Azion configuration
│   └── azion.json         # Resource definitions
├── scripts/
│   └── deploy.sh          # Deployment script
└── package.json
```

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Health check |
| GET | `/healthz` | No | Health check (Kubernetes) |
| GET | `/tasks` | Yes | List all tasks |
| GET | `/tasks/:id` | Yes | Get task by ID |
| GET | `/db/test` | Yes | List database users |
| POST | `/db/test` | Yes | Create database user |

### Example Requests

```bash
# Health check (public)
curl http://localhost:3000/health

# List tasks (requires auth)
curl -H "Authorization: token YOUR_TOKEN" http://localhost:3000/tasks

# Get task by ID
curl -H "Authorization: token YOUR_TOKEN" http://localhost:3000/tasks/1

# Create user (requires auth + body)
curl -X POST http://localhost:3000/db/test \
  -H "Authorization: token YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "John Doe", "email": "john@example.com"}'
```

---

## Authentication

This API uses `@azion/js-auth` for authentication. Protected endpoints require one of:

### API Token

```bash
Authorization: token <your-azion-token>
# or
Authorization: Bearer <your-azion-token>
```

### Session Cookie

```bash
Cookie: azsid=<session-id>        # production
Cookie: azsid_stg=<session-id>    # stage
```

### Authentication Flow

```
┌─────────┐     ┌──────────────────┐     ┌─────────┐
│ Client  │────▶│  Example API     │────▶│   SSO   │
│         │     │  (Edge Function) │     │ GraphQL │
└─────────┘     └──────────────────┘     └─────────┘
     │                   │                     │
     │  1. Request +     │  2. Validate via    │
     │     Token/Cookie  │     @azion/js-auth  │
     │                   │────────────────────▶│
     │                   │                     │
     │                   │  3. User & Account  │
     │                   │◀────────────────────│
     │                   │                     │
     │  4. Response      │                     │
     │◀──────────────────│                     │
```

### Middleware Usage

```typescript
import { azionAuthMiddleware } from './middleware/auth.ts';

// Apply to protected routes
app.get('/tasks', azionAuthMiddleware, listTasksHandler);
```

---

## Error Handling

This API uses `@azion/js-api-errors` for standardized error responses following JSON:API specification.

### Error Response Format

```json
{
  "errors": [
    {
      "code": "10001",
      "title": "Not Found",
      "detail": "The requested resource was not found.",
      "status": "404",
      "meta": {
        "requestId": "abc123"
      }
    }
  ]
}
```

### Using Error Codes

```typescript
import { APIErrorException, codes, exceptionHandler } from '@azion/js-api-errors';

// Throw specific errors
throw new APIErrorException(codes.NOT_FOUND);
throw new APIErrorException({
  errorCode: codes.VALIDATION_ERROR,
  field: 'email',
  meta: { received: 'invalid' }
});

// Global error handler
app.onError((err, c) => {
  return exceptionHandler(err, { request: c.req.raw });
});
```

---

## Development

### Available Scripts

```bash
bun run dev         # Start Bun development server
bun run dev:azion   # Start Azion Edge Runtime locally
bun run build:azion # Build for Azion deployment
bun run typecheck   # Run TypeScript type checking
bun test            # Run tests
```

### Entry Points

| File | Purpose | Runtime |
|------|---------|---------|
| `src/server.ts` | Development server | Bun |
| `src/azion.ts` | Edge Functions entry | Azion Edge |
| `src/index.ts` | Hono app (shared) | Both |

### Environment Variables in Azion

In Azion Edge Functions, args are passed via `FetchEvent.args`, **not** via `Azion.env.get()`.

The `src/env.ts` module provides a unified `getEnv()` function:
- **Azion Edge:** Reads from `FetchEvent.args` (set by `azion.ts`)
- **Bun/Node:** Reads from `process.env`

---

## Deployment

### Using Deploy Script (Recommended)

```bash
# Login to Azion (first time)
azion login

# Deploy
./scripts/deploy.sh
```

The script will:
1. Load environment variables from `.env`
2. Generate `azion/args.json` with secrets
3. Build with `bun build`
4. Deploy to Azion Edge Functions

### Build

```bash
bun run build:azion
# Output: dist/azion.js
```

> **Important:** Always use `bun build`, not `azion build`. The Azion bundler generates incompatible Node.js imports (`node:fs`, `node:module`) that don't work in the Edge Runtime.

### Manual Deployment

```bash
# Build
bun run build:azion

# Copy to expected location
mkdir -p .edge
cp dist/azion.js .edge/worker.js

# Deploy
azion deploy --local --skip-build --yes
```

> **Note:** Changes may take 15-30 seconds to propagate globally.

---

## Troubleshooting

### Function not updating after deploy

- Propagation takes ~15-30 seconds
- Try `?nocache=timestamp` to bypass edge cache

### Build fails with Node.js imports

Always use `bun build --target=browser`. The Azion bundler (`azion build`) adds incompatible `node:fs` and `node:module` imports.

### Args not being read

Args are passed via `FetchEvent.args`, not `Azion.env.get()`. Make sure:
1. `setAzionArgs()` is called in `azion.ts`
2. Config modules use `getEnv()` from `env.ts`

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Deploy to Azion
  run: |
    cat > .env << EOF
    SSO_MODE=${{ vars.SSO_MODE }}
    SSO_GQL_SECRET=${{ secrets.SSO_GQL_SECRET }}
    EOF
    
    azion login --token ${{ secrets.AZION_TOKEN }}
    ./scripts/deploy.sh
```

---

## Related Libraries

### @azion/js-auth

Authentication library for Azion Edge Functions.

- [Documentation](./js-azion-auth/README.md)
- [Repository](https://github.com/aziontech/js-azion-auth)

### @azion/js-api-errors

Error handling library following JSON:API specification.

- [Documentation](./js-azion-api-errors/README.md)
- [Repository](https://github.com/aziontech/js-azion-api-errors)

---

## Maintainers

- [**Team Product #1**](mailto:core-squad@azion.com)

---

## License

MIT
