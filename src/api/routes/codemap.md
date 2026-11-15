# src/api/routes/

## Responsibility
One module per resource family. Each exports stateless handler functions matching the `RouteHandler` signature; `src/api/server.ts#buildRouter()` binds them to paths.

## Design
- **Handler-function modules, not Express routers.** No module owns middleware; auth/rate-limit/CORS are applied in `server.ts`.
- **Read handlers are synchronous file readers** over the Data repo (`publicData.ts` is the shared reader layer); action/cron handlers are async and call job functions.
- **Tolerant readers**: missing index/latest/corrupt JSON degrades to `null`/`[]` rather than throwing.
- **Compact key schema**: public datasets use abbreviated field names (`cv`, `ac`, `ix`, `in`, `ch`) to keep payloads small.

## Flow
- Public read path: request → `rateLimitMiddleware` → `loadLatestMacroData/loadMacroHistory/loadMacroIndexes/loadMacroInflation` → `index.json` → newest snapshot file → response.
- Command path: `POST /api/actions/:action` → `handleAction` → `src/admin/index.ts#executeAction`; `POST /api/actions/scheduler/:cmd` → `handleSchedulerControl`.
- Cron path: `GET|POST /api/cron/cycle` → `handleCronCycle` (runs a full cycle) ; `/api/cron/trigger-fetch` → `handleTriggerFetch`.
- Export path: `GET /api/public/export` lists datasets; `GET /api/public/export/:dataset` returns the exported file; `/api/public/sync` proxies sync.

## Files
- `publicData.ts` — typed readers (`loadLatestMacroData`, `loadMacroHistory`, `loadMacroIndexes`, `loadMacroInflation`) and public interfaces; also used by the export pipeline.
- `public.ts` — `handlePublicMacro`, `handlePublicIndexes`, `handlePublicInflation`, `handlePublicStatus`.
- `publicExport.ts` — `handlePublicExport`, `handlePublicExportList`.
- `macro.ts` — macro history/indexes/inflation/phases/latest/list-history handlers.
- `snapshots.ts` — list all snapshots, list per realm, fetch one snapshot file.
- `archives.ts` — list archives, list per-realm archives.
- `config.ts` — list config sections, get section, update section.
- `actions.ts` — `handleAction` (routes to `executeAction`) and `handleSchedulerControl`.
- `cron.ts` — `handleCronCycle`, `handleTriggerFetch` (secret-guarded cycle triggers).
- `status.ts` — aggregate status payload (health + failures + scheduler state).
- `health.ts` — thin wrapper over `handleHealth` from `src/health`.
- `sync.ts` — public sync trigger handler.

## Integration
- Bound by: `src/api/server.ts#buildRouter()`.
- Depends on: `src/jobs/*`, `src/admin/index.ts`, `src/config`, `src/health/health.ts`, `src/jobs/relationalUtils.ts`.
- Consumed by the Web frontend through `/api/public/*` and by the admin UI through `/api/actions/*`, `/api/config/*`, `/api/snapshots/*`.
