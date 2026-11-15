# src/

## Responsibility
Application root of the backend: the CLI dispatcher (`index.ts`), the shared in-memory cache, and the feature folders (`api/`, `jobs/`, `config/`, `storage/`, `health/`, `events/`, `errors/`, `logging/`, `scripts/`).

## Design
- **Command-dispatch CLI**: `src/index.ts` reads `process.argv`, loads config once, sets the log level, then routes to exactly one command and returns. Unknown args print a short config banner.
- **Thin composition root**: `index.ts` is the only file that wires config + jobs + server + admin together; feature modules never import the CLI.
- **Two deployment shapes** share the same code: long-running `server`/`scheduler` processes and Vercel serverless functions (`api/index.ts` → `createApp()`).

## Flow
`main()` → `loadConfig()` → `setLogLevel()` → argv switch:
- `health [--async]`, `status` → `src/health/health.ts`
- `fetch` → `runFetch()`
- `scheduler|watch` → `startScheduler()` with SIGINT/SIGTERM → `shutdown()`
- `aggregate`, `compress`, `cleanup` → per-realm job loops using `cfg.dataRepo.path`
- `public-export` → `runPublicExportPipeline()`
- `admin <action> [jsonParams]` → `executeAction()`
- `server` → `startServer(envNumber("HTTP_PORT", 3001))`
- `analytics` → `runAnalytics()` (placeholder for Phase 2)

## Files
- `index.ts` — CLI entry/dispatcher (100 lines). Fixed: `args[1]` → `args[0]` bug for server command. All package.json scripts now dispatched.
- `cache.ts` — `SimpleCache` singleton `cache` and `withCache(key, ttl, fn)` helper.
- `data/cooperinc-static.ts` — Building definitions, core constants, 155 resource names (Phase 2)
- `analytics/phaseCoefficients.ts` — Weekly cubic regression job for phase coefficients (Phase 2)

## Integration
- Entry: `npm start` → `node dist/src/index.js <command>`.
- Depends on: every feature folder below it. Sub-maps: `api/`, `jobs/`, `config/`, `storage/`, `health/`, `events/`, `errors/`, `logging/`, `scripts/`.

## Verification Status (as of 2026-11-15)
- ✅ Build: `npm run build` passes
- ✅ Tests: `npm test` - 154 tests pass
- ✅ Server starts on port 3001 with `npm start -- server`
- ✅ API endpoints: `/api/health`, `/api/public/alerts`, `/api/public/macro` respond correctly
- ⏳ Cycle counter restart test pending
- ⏳ Phase coefficient R² validation pending (needs 30+ days data)