# Example API - Development Guide

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) >= 1.0
- [Azion CLI](https://www.azion.com/en/documentation/products/azion-cli/overview/) - Required for deploy

### Setup

1. Install dependencies:
   ```bash
   bun install
   ```

2. Create `.env` file (copy from `.env.example`):
   ```env
   SSO_MODE=stage
   SSO_GQL_SECRET=your_secret_here
   RDS_REGION=us-east-1
   RDS_RESOURCE_ARN=arn:aws:rds:us-east-1:xxx:cluster:xxx
   RDS_SECRET_ARN=arn:aws:secretsmanager:us-east-1:xxx:secret:xxx
   RDS_DATABASE=your_database
   AWS_ACCESS_KEY_ID=your_key
   AWS_SECRET_ACCESS_KEY=your_secret
   ```

## Development

### Local Server (Bun)

```bash
bun run dev
# Server running at http://localhost:3000
```

### Local Edge Runtime (Azion)

```bash
bun run dev:azion
# Server running at http://localhost:3333
```

## Testing

```bash
bun test        # Run unit tests
bun run typecheck   # Type checking
```

## Build

```bash
bun run build:azion
# Output: dist/azion.js (~460KB)
```

> **Important:** Always use `bun build`, not `azion build`. 
> The Azion bundler generates incompatible Node.js imports (`node:fs`, `node:module`) 
> that don't work in the Edge Runtime.

## Deploy

### Using deploy script (Recommended)

```bash
# First time: Login to Azion
azion login

# Deploy
./scripts/deploy.sh
```

The script will:
1. Load environment variables from `.env`
2. Generate `azion/args.json` with secrets
3. Build with `bun build`
4. Copy to `.edge/worker.js`
5. Run `azion deploy --local --skip-build`
   - Updates Edge Function code
   - Updates Function Instance args

> **Note:** Changes may take 15-30 seconds to propagate globally.

### Sync configuration from Azion

To pull the current configuration from Azion:

```bash
azion sync
```

This updates `azion/azion.json` with the current state of your resources.

### Manual deploy commands

```bash
# Build
bun run build:azion

# Copy to expected location
mkdir -p .edge
cp dist/azion.js .edge/worker.js
echo '{"cache":[],"origin":[],"rules":[],"purge":[]}' > .edge/manifest.json

# Deploy (updates function code and instance args)
azion deploy --local --skip-build --yes
```

## Architecture

### Entry Points

| File | Purpose | Runtime |
|------|---------|---------|
| `src/server.ts` | Development server | Bun |
| `src/azion.ts` | Edge Functions entry | Azion Edge |
| `src/index.ts` | Hono app (shared) | Both |

### Environment Variables

In Azion Edge Functions, args are passed via `FetchEvent.args`, **not** via `Azion.env.get()`.

The `src/env.ts` module provides a unified `getEnv()` function:
- **Azion Edge:** Reads from `FetchEvent.args` (set by `azion.ts`)
- **Bun/Node:** Reads from `process.env`

### Key Files

```
src/
├── azion.ts           # Edge Functions entry point
├── azion.d.ts         # Azion runtime type declarations
├── env.ts             # Environment variable management
├── config.ts          # SSO/Auth configuration
├── index.ts           # Hono app configuration
├── server.ts          # Bun development server
├── types.ts           # TypeScript types
├── handlers/          # Route handlers
│   ├── health.ts
│   ├── tasks.ts
│   └── db-test.ts
├── middleware/        # Hono middlewares
│   ├── auth.ts
│   ├── security.ts
│   └── validation.ts
└── db/                # Database layer
    ├── config.ts
    ├── index.ts
    └── schema.ts
```

## Azion Resources

Resources are tracked in `azion/azion.json`:

| Resource | Description |
|----------|-------------|
| Edge Function | API code |
| Function Instance | Args/configuration |
| Edge Application | Main application |
| Domain | Public URL |

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Health check |
| GET | `/healthz` | No | Health check (k8s) |
| GET | `/tasks` | Yes | List tasks |
| GET | `/tasks/:id` | Yes | Get task by ID |
| GET | `/db/test` | Yes | List DB users |
| POST | `/db/test` | Yes | Create DB user |

### Authentication

Protected endpoints require one of:
- **API Token:** `Authorization: token <your-token>`
- **Session Cookie:** `Cookie: azsid_stg=<session>` (for stage mode)

## Troubleshooting

### Function not updating after deploy

- Propagation takes ~15-30 seconds
- Try `?nocache=timestamp` to bypass edge cache

### Build fails with Node.js imports

Always use `bun build --target=browser`. The Azion bundler (`azion build`) adds 
incompatible `node:fs` and `node:module` imports.

### Args not being read

Args are passed via `FetchEvent.args`, not `Azion.env.get()`.
Make sure:
1. `setAzionArgs()` is called in `azion.ts`
2. Config modules use `getEnv()` from `env.ts`

## CI/CD Integration

```yaml
# GitHub Actions example
- name: Deploy to Azion
  run: |
    # Create .env from secrets
    cat > .env << EOF
    SSO_MODE=${{ vars.SSO_MODE }}
    SSO_GQL_SECRET=${{ secrets.SSO_GQL_SECRET }}
    RDS_REGION=${{ vars.RDS_REGION }}
    RDS_RESOURCE_ARN=${{ secrets.RDS_RESOURCE_ARN }}
    RDS_SECRET_ARN=${{ secrets.RDS_SECRET_ARN }}
    RDS_DATABASE=${{ vars.RDS_DATABASE }}
    AWS_ACCESS_KEY_ID=${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY=${{ secrets.AWS_SECRET_ACCESS_KEY }}
    EOF
    
    # Login and deploy
    azion login --token ${{ secrets.AZION_TOKEN }}
    ./scripts/deploy.sh
```
