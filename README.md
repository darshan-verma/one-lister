# One Lister

Multichannel e-commerce platform for Indian sellers. This repo is a pnpm + Turborepo monorepo (modular monolith).

## Prerequisites

- Node.js 22+ (20.6+ minimum for `--env-file`)
- [pnpm](https://pnpm.io/) 10+
- Docker + Docker Compose

## Local setup

```bash
# 1. Install dependencies
pnpm install

# 2. Environment (apps symlink to the root .env for Next.js / worker)
cp .env.example .env
ln -sfn ../../.env apps/web/.env
ln -sfn ../../.env apps/worker/.env

# 3. Start Postgres 16 + Redis
#    If Homebrew Postgres/Redis already bind :5432 / :6379, stop them first:
#    brew services stop postgresql@14 redis
docker compose up -d

# 4. Apply database migrations
pnpm db:migrate

# 5. Start web (Next.js) + worker (BullMQ) together
pnpm dev
```

- Web: [http://localhost:3000](http://localhost:3000)
- Health: [http://localhost:3000/api/health](http://localhost:3000/api/health) → `{ "status": "ok", "db": "ok", "redis": "ok" }`
- Worker logs a `[heartbeat]` line on start and every minute thereafter

## Useful scripts

| Script           | Description                                      |
| ---------------- | ------------------------------------------------ |
| `pnpm dev`       | Run all `dev` tasks (web + worker) via Turborepo |
| `pnpm build`     | Build all packages and apps                      |
| `pnpm lint`      | Lint all workspaces                              |
| `pnpm typecheck` | TypeScript check all workspaces                  |
| `pnpm test`      | Run Vitest (and no-op stubs elsewhere)           |
| `pnpm db:generate` | Generate Drizzle migrations from schema        |
| `pnpm db:migrate`  | Apply Drizzle migrations                       |

## Workspace layout

```
apps/web          Next.js App Router (seller dashboard / API / webhooks)
apps/worker       BullMQ consumers + schedulers
packages/db       Drizzle schema, migrations, client factory
packages/core     Domain / business logic
packages/connectors  MarketplaceConnector interface + per-marketplace stubs
packages/config   Shared tsconfig, ESLint, Prettier, Zod env loader
```
