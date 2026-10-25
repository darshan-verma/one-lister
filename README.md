# One Lister

Multichannel e-commerce platform for Indian sellers. This repo is a pnpm + Turborepo monorepo (modular monolith).

## Prerequisites

- Node.js 22+ (20.6+ minimum for `--env-file` in local worker `dev`)
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
#    Host ports are 5433 (Postgres) and 6380 (Redis) so they do not clash with
#    typical Homebrew installs on 5432 / 6379. See .env.example.
docker compose up -d

# 4. Apply database migrations
pnpm db:migrate

# 5. Start all workspaces (package tsc --watch + web + worker)
pnpm dev
```

- Web: [http://localhost:3000](http://localhost:3000)
- Liveness: [http://localhost:3000/api/health](http://localhost:3000/api/health) → `{ "status": "ok" }` (no DB/Redis)
- Readiness: [http://localhost:3000/api/health/ready](http://localhost:3000/api/health/ready) → `{ "status": "ok", "db": "ok", "redis": "ok" }`
- Worker logs a `[heartbeat]` line on start and every minute thereafter

### Dev hot-reload notes

Packages export from `dist/`. `pnpm dev` runs `tsc --watch` in every package so `dist/` stays fresh when you edit sources.

| Consumer | After editing `packages/*` |
| -------- | -------------------------- |
| **web** (Next.js) | Usually picks up changes on the next request / Fast Refresh. If a change does not appear, restart the web `dev` process. |
| **worker** (`tsx watch`) | Watches the worker entry graph, not package `dist/` rebuilds. **Restart the worker** (or the whole `pnpm dev`) after changing a workspace package the worker imports. |

Production `start` scripts do **not** use `--env-file` — set env vars in the process environment (e.g. ECS task definition). Local `dev` scripts still load the root `.env` via `--env-file` where needed.

## Useful scripts

| Script           | Description                                      |
| ---------------- | ------------------------------------------------ |
| `pnpm dev`       | Run all workspace `dev` tasks via Turborepo      |
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
