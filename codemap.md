# Repository Atlas: SimcoIntel Backend

## Project Responsibility
Node.js/TypeScript data pipeline that fetches Sim Companies market data, computes economics (profit margins, price indexes, inflation, realm metrics, macro history), and **exports optimized JSON into a separate `Data` GitHub repository** that the Web frontend reads directly from a CDN ("Backend as Data Exporter"). Optionally serves an Express admin API and a static admin dashboard; designed to run both as a long-lived scheduler and as a Vercel serverless function.

## System Entry Points
- `src/index.ts` — CLI dispatcher (`fetch`, `scheduler|watch`, `aggregate`, `compress`, `cleanup`, `public-export`, `health`, `status`, `admin <action>`, `server`).
- `api/index.ts` — Vercel serverless entry; `export default createApp()`. `vercel.json` rewrites `/api/*`, `/admin/*` and `/*` here (maxDuration 300 s).
- `package.json` — build (`tsc && copy-admin-assets`), all operational scripts, test scripts.
- `src/jobs/scheduler.ts` — production cycle loop (fetch → aggregate → margins → history → export → compress).
- `.github/workflows/cron.yml` — external cron driver for the serverless cycle.

## Architecture At a Glance
```
CLI / Vercel cron / Admin UI
        │
   src/index.ts ──► src/jobs/* ──► src/storage/dataRepoWriter.ts ──► GitHub Contents API
        │                │                                            (SimcoIntel/Data)
   src/api/server.ts     └──► GitHub raw readers (src/api/routes/publicData.ts)
        │
   admin/public (static SPA)
```
- Config is layered: code defaults → `config/*.json` → env vars (`src/config/index.ts`), cached, reloadable at runtime.
- On-disk data layout (root = `DATA_REPO_PATH`): `snapshots/market|government/…`, `aggregates/{market,indexes,inflation,macro-history,retail,realm-status}/realm-N`, `archives/macro/realm-N`, `state/backfill`, `public/realm-N/*.json` + `public/manifest.json`, `meta/scheduler-cycle.json`.
- Public dataset contract: `macro.json`, `history.json`, `indexes.json`, `inflation.json`, `margins.json`, `government-orders.json`, `retail.json`, `manifest.json`.

## Directory Map (Aggregated)
| Directory | Responsibility Summary | Detailed Map |
|-----------|------------------------|--------------|
| `src/` | CLI composition root + shared cache; feature-folder parent | [View](src/codemap.md) |
| `src/jobs/` | Fetch → aggregate → analytics → export pipeline and the cycle scheduler | [View](src/jobs/codemap.md) |
| `src/api/` | Express app, custom path router, envelopes, rate limiting, Sim Companies client | [View](src/api/codemap.md) |
| `src/api/routes/` | One handler module per resource family | [View](src/api/routes/codemap.md) |
| `src/admin/` | `executeAction` dispatch shared by CLI and HTTP | [View](src/admin/codemap.md) |
| `src/config/` | Env + JSON config loading, typed schema, cache/reload | [View](src/config/codemap.md) |
| `src/storage/` | GitHub Contents API writer, per-directory `index.json` maintenance | [View](src/storage/codemap.md) |
| `src/health/` | Aggregated health report for CLI/API | [View](src/health/codemap.md) |
| `src/events/` | Typed in-process pub/sub for lifecycle events | [View](src/events/codemap.md) |
| `src/errors/` | Error hierarchy (`ApiError`, `ConfigError`, `StorageError`) | [View](src/errors/codemap.md) |
| `src/logging/` | Leveled singleton logger | [View](src/logging/codemap.md) |
| `src/scripts/` | Operator CLIs: integrity, storage report, backup, config snapshot, env check | [View](src/scripts/codemap.md) |
| `api/` | Vercel serverless adapter (3 lines) | [View](api/codemap.md) |
| `config/` | Operator-editable JSON: formulas, schedules, feature flags, macro settings/history/indexes, government orders | [View](config/codemap.md) |
| `admin/` | Static admin dashboard (vanilla HTML/CSS/JS) | [View](admin/codemap.md) |
| `admin/public/` | Dashboard shell + CSS | [View](admin/public/codemap.md) |
| `admin/public/js/` | `AdminDashboard` controller (tabs, API calls, canvas charts) | [View](admin/public/js/codemap.md) |
| `scripts/` | Post-build admin asset copy | [View](scripts/codemap.md) |

## Build / Run
- `npm run build` → `tsc` to `dist/` + copy `admin/public`.
- `npm start -- server` (port from `HTTP_PORT`, default 3001) · `npm start -- scheduler` · `npm start -- public-export`.
- Tests: Vitest (`test`, `test:unit`, `test:integration` → `src/__tests__/pipelines/`, `test:contracts` → `src/__tests__/api/`). Note: integration/contract test paths in `package.json` reference folders that do not currently exist; unit tests live in `src/__tests__/{jobs,integration}`.
- Env: `DATA_REPO_PATH`, `GITHUB_TOKEN`, `DATA_REPO_{OWNER,NAME,BRANCH}`, `SIMCO_API_BASE_URL`, `SIMCO_REALMS`, `HTTP_PORT`, `LOG_LEVEL`, `CRON_SECRET`, `VERCEL_URL`.

## Known Drift / Watch-outs
- `package.json` exposes commands (`macro`, `realm-status`, `price-indexes`, `inflation`, `macro-history`, `macro-backfill`, `macro-archive`, `analytics`) that `src/index.ts` does not dispatch.
- `src/test-data-temp/` exists in the tree but is not covered by the codemap include patterns.
- Vercel runs the API only; the scheduler requires a separate host or external cron.
