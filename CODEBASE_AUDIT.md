# Backend Codebase Audit Report

**Date:** 2026-10-28  
**Scope:** Full backend audit covering API routes, jobs, storage, config, error handling, security, and test coverage.

---

## Executive Summary

The codebase is a **config-driven data pipeline for Sim Companies analytics** with:
- **Express-like custom router** on native HTTP server (Vercel-compatible)
- **Scheduled jobs** for fetching market data, aggregation, macro analytics, public exports
- **File-based storage** with optional GitHub push for data persistence
- **Feature-flag driven** architecture with extensive configuration

**Overall Health:** 🟡 **Medium Risk** - Functional but has significant security, reliability, and maintainability issues that should be addressed before production hardening.

---

## 🔴 Critical Issues (Security & Data Integrity)

### 1. **CORS Wildcard on All Routes** — `src/api/server.ts:212-222`
```typescript
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");  // ⚠️ Allows any origin
  // ...
});
```
**Risk:** CSRF, data exfiltration, unauthorized API access from any website.  
**Fix:** Restrict to known origins (admin dashboard, frontend domains). Add `Vary: Origin` header.

### 2. **No Authentication/Authorization on Admin & Config Mutations** — `src/api/routes/config.ts:40-64`, `src/api/routes/actions.ts`
- `PUT /api/config/:section` — **No auth**, accepts any JSON body, writes to disk, triggers reload
- `POST /api/actions/:action` — Executes admin actions (`fetch`, `aggregate`, `cleanup`, `compress`, `update-config`, `set-log-level`) **without any auth check**
- `POST /api/actions/scheduler/:cmd` — Can start/stop scheduler **without auth**

**Risk:** Full control plane takeover — attackers can reconfigure the pipeline, trigger expensive operations, or DoS the scheduler.  
**Fix:** Require `Authorization: Bearer <ADMIN_TOKEN>` header; validate against `ADMIN_API_TOKEN` env var.

### 3. **Cron Secret Check Allows Empty Secret** — `src/api/routes/cron.ts:16-18`
```typescript
function checkSecret(req): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return true;  // ⚠️ No secret = open access
  // ...
}
```
**Risk:** If `CRON_SECRET` not set, `/api/cron/cycle` and `/api/cron/trigger-fetch` are **publicly accessible** — can trigger full pipeline runs, GitHub dispatches, data pushes.  
**Fix:** Return `false` when `CRON_SECRET` is unset; require explicit configuration.

### 4. **Path Traversal in Static File Serving** — `src/api/server.ts:164-168`
```typescript
const filePath = join(staticDir, req.path);
const resolvedFilePath = resolve(filePath);
if (!resolve(resolvedFilePath).startsWith(resolve(staticDir) + sep)) {
  return res.status(403).send("Forbidden");
}
```
**Issue:** The check uses `resolve()` which **normalizes symlinks**. If `staticDir` is a symlink, `resolve(staticDir)` returns the real path, but `resolve(filePath)` may not — bypass possible.  
**Fix:** Use `realpathSync` for both paths, or use a hardened static server (e.g., `serve-static`).

### 5. **GitHub Token Cached Indefinitely in Memory** — `src/api/connectAuth.ts:3,19-35`
```typescript
let cachedToken: string | null = null;
// Never cleared except explicit call or process restart
```
**Risk:** If token is rotated (e.g., GitHub PAT expiry), the app continues using stale token until restart. No TTL, no refresh logic.  
**Fix:** Add token expiry tracking (parse JWT `exp` claim if JWT, or add configurable TTL).

---

## 🟠 High Severity (Reliability & Correctness)

### 6. **Scheduler Runs Jobs Sequentially Despite "Parallel" Comments** — `src/jobs/scheduler.ts:92-128`
```typescript
// Parallelize realm processing where possible
if (cfg.featureFlags.enableAggregation) {
  const aggResults = await Promise.allSettled(  // ✓ Correct
    cfg.simco.realms.map(async (realm) => { ... })
  );
}
if (cfg.macroSettings.enableProfitMargins) {  // ✗ Sequential
  await runAllProfitMargins();
}
if (cfg.macroHistory.enableHistoryIngestion) {  // ✗ Sequential
  await runAllHistorySync();
}
```
**Issue:** Profit margins, history sync, government orders, public export, compression all run **sequentially** despite comments claiming parallelization. With 2+ realms, adds minutes per cycle.  
**Fix:** Wrap independent pipelines in `Promise.allSettled`; use a concurrency limiter (e.g., `p-limit`) to avoid overwhelming external APIs.

### 7. **Rate Limiter Not Scaled for Multi-Instance Deployments** — `src/api/rateLimiter.ts:11`
```typescript
const entries = new Map<string, RateLimitEntry>();  // In-memory only
```
**Risk:** On Vercel/serverless or multi-container deployments, **each instance has separate limits** — effective limit = `MAX_REQUESTS × instances`. No distributed rate limiting (Redis, etc.).  
**Fix:** Document as single-instance only; or integrate Upstash Redis / Vercel KV for shared state.

### 8. **Config Merge Replaces Arrays Instead of Merging** — `src/config/index.ts:38-46`
```typescript
function deepMerge(target, source) {
  if (Array.isArray(source)) return source;  // ⚠️ Replaces entire array
  // ...
}
```
**Risk:** Config sections with arrays (e.g., `macroIndexes.categories`, `formulas.profitMarginThresholds` if extended) **cannot be partially overridden** — must redefine entire array.  
**Fix:** Add array merge strategy (concat, unique, replace) per key, or use a proper deep-merge library (e.g., `lodash.mergeWith`).

### 9. **DataRepoWriter Singleton Not Safe for Config Reload** — `src/storage/dataRepoWriter.ts:265-275`
```typescript
let dataRepoWriterInstance: DataRepoWriter | null = null;
export function getDataRepoWriter(config?: DataRepoConfig): DataRepoWriter {
  if (!dataRepoWriterInstance && config) {
    dataRepoWriterInstance = new DataRepoWriter(config);
  }
  // If config changes (e.g., githubToken rotated), old instance keeps stale config
}
```
**Risk:** After `reloadConfig()` (triggered by config API), the singleton still holds **old `githubToken`, `owner`, `repo`** — pushes go to wrong repo or fail silently.  
**Fix:** In `resetDataRepoWriter()`, also clear any in-flight operations; or make `DataRepoWriter` accept config per-call.

### 10. **Government Orders Scheduler Logic Has Edge Cases** — `src/jobs/scheduler.ts:192-210`
```typescript
function shouldFetchGovernmentOrders(cfg): boolean {
  const now = new Date();
  const currentDay = now.getUTCDay();
  // ...
  if (currentHour < targetHour) return false;
  if (currentHour === targetHour && currentMinute < targetMinute) return false;
  return true;
}
```
**Issues:**
- Runs **every cycle** after the target time on the target day (not "once per week")
- `lastGovernmentOrdersFetchDate` prevents re-fetch same day, but **if cycle runs at 13:05 and again at 13:20, both pass** (same `todayStr`)
- No handling for missed windows (e.g., scheduler down on Wednesday)  
**Fix:** Track `lastFetchWeek` (ISO week number) instead of date; add "catch-up" logic.

### 11. **No Request Body Size Limit on Raw HTTP Parser** — `src/api/middleware.ts:26-59`
```typescript
export function parseJsonBody(req, timeoutMs = 5000): Promise<unknown> {
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));  // ⚠️ No size limit
  // ...
}
```
**Risk:** Memory exhaustion via large request bodies (DoS). Express's `express.json({ limit: '1mb' })` only applies to Express-parsed routes; custom router bypasses it for non-Express handlers.  
**Fix:** Add `content-length` check and streaming byte limit in `parseJsonBody`.

### 12. **Fetch Job Returns Partial Success as Overall Failure** — `src/jobs/fetchJob.ts:197`
```typescript
const allOk = totalOk === cfg.simco.realms.length;
return { ok: allOk, ... };
```
**Issue:** If **1 of N realms fails**, entire `runFetch()` returns `ok: false` — triggers failure tracker, alerts, and may block downstream pipelines.  
**Fix:** Distinguish "partial degradation" from "total failure"; add `degraded: boolean` field.

### 13. **Cleanup Job Doesn't Remove Empty Realm Directories** — `src/jobs/cleanup.ts:31-53`
After deleting all snapshots in a realm dir, the empty directory remains — accumulates over time.  
**Fix:** After file loop, `if (readdirSync(realmDir).length === 0) rmdirSync(realmDir);`

### 14. **Error Handling Swallows Stack Traces** — Multiple files
```typescript
catch (err) {
  logger.error("Message", err instanceof Error ? err.message : String(err));  // Loses stack
}
```
**Files:** `fetchJob.ts:118`, `scheduler.ts:114,126,141`, `dataRepoWriter.ts:147`, etc.  
**Fix:** Pass `err` directly to logger (if logger supports it) or log `err.stack`.

---

## 🟡 Medium Severity (Maintainability & Type Safety)

### 15. **Custom Router Lacks Features & Has Bugs** — `src/api/router.ts`
- **No query string parsing** — handlers must parse manually from `req.url`
- **No middleware support** — auth, validation, logging must be inlined
- **Path matching is exact-segment only** — no wildcards, regex, optional params
- **Case-sensitive** — `/api/health` vs `/api/HEALTH` mismatch
- **No route ranking** — first match wins, order-dependent  
**Risk:** Technical debt; hard to add auth, validation, OpenAPI generation.  
**Fix:** Migrate to `fastify` or `hono` (lightweight, typed, middleware support) — or at minimum extract middleware chain.

### 16. **Type Safety Gaps — `any`/`unknown` Misuse**
- `src/api/server.ts:96-103` — `wrapRateLimited` uses `unknown` for body/query but handlers expect specific types
- `src/api/routes/publicExport.ts:11` — `type Dataset = "macro" | ...` but `params.dataset` is `string`
- `src/jobs/publicExportPipeline.ts:189` — `as { t: string; r: number; orders: any[] }` — `any[]` defeats type checking
- `src/config/index.ts:131` — `let macroIndexes: MacroIndexConfig = { categories: {} };` — implicit `any` for categories values  
**Fix:** Enable `noImplicitAny: true` (already in tsconfig), fix remaining `any` casts.

### 17. **Logger Lacks Structured Logging & Context** — `src/logging/logger.ts`
```typescript
function log(level, ...args) {  // No structured fields, no correlation IDs
  out(prefix, ...args);
}
```
**Issues:**
- No JSON output option (critical for log aggregation)
- No request correlation IDs (trace requests across services)
- No child loggers with bound context (realm, job name, etc.)  
**Fix:** Use `pino` or `winston` with JSON output, child loggers, and log levels per module.

### 18. **Config Validation Missing** — `src/config/index.ts`
- No schema validation (Zod, Valibot, ArkType) — invalid JSON configs crash at runtime
- No validation of numeric ranges (e.g., `fetchIntervalMinutes < 1`, `retentionDays < 0`)
- No validation of realm IDs (must be valid Sim Companies realms)  
**Fix:** Add Zod schemas matching `schema.ts` interfaces; validate on load.

### 19. **Hardcoded Timeouts & Magic Numbers**
- `src/api/simcoTools.ts:119` — `minInterval = 600` (ms) hardcoded
- `src/api/simcoTools.ts:236` — `30000` ms candlestick timeout
- `src/storage/dataRepoWriter.ts:29` — `10000` ms GitHub API timeout
- `src/api/middleware.ts:26` — `5000` ms body parse timeout  
**Fix:** Move to config (`schedules.apiTimeouts`); allow env override.

### 20. **Duplicate Config Write Logic** — `src/api/routes/config.ts:56-64` vs `src/admin/index.ts:103-122`
Both implement "find config file, merge, write, reload" — **diverged implementations**:
- API route: searches multiple paths, picks first existing
- Admin action: always uses first path (`configPaths[0]`)
- Admin action has 3 paths vs 2 in API route  
**Fix:** Extract to shared `configWriter.ts` module.

### 21. **Test Coverage Gaps**
| Area | Coverage | Missing |
|------|----------|---------|
| API routes | ❌ None | All route handlers untested |
| Scheduler | ❌ None | Core orchestration logic untested |
| Config load/reload | ❌ None | Critical path untested |
| DataRepoWriter | ❌ None | GitHub push logic untested |
| Rate limiter | ❌ None | Core security control untested |
| Admin actions | ❌ None | Control plane untested |
| SimcoTools client | ❌ None | External API integration untested |
| Only covered: | ✅ | `fetchJob` pure functions (`shrinkResources`, `fetchWithRetry`) |

**Fix:** Add integration tests for API routes (using `supertest` or native fetch), unit tests for scheduler logic (mock jobs), contract tests for config.

### 22. **No Health Check Dependencies** — `src/health/health.ts` (not read but inferred)
Health endpoint (`/api/health`) likely only checks local state — **no dependency checks** (SimCoTools API, GitHub API, data repo filesystem).  
**Fix:** Add `generateHealthReport()` to verify external dependencies; return `degraded` status if any critical dependency fails.

### 23. **Public Export Pipeline Runs Macro Pipeline Inline** — `src/jobs/publicExportPipeline.ts:48-52`
```typescript
try {
  await runMacroPipeline();  // Runs full macro pipeline every export cycle
} catch (err) { ... }
```
**Issue:** Public export (runs every scheduler cycle ~15 min) **re-runs entire macro pipeline** — redundant, slow, couples export to macro freshness.  
**Fix:** Decouple — export should read already-computed data; macro pipeline runs on its own schedule.

### 24. **No Graceful Shutdown for In-Flight Jobs** — `src/jobs/scheduler.ts:28-31`
```typescript
export function shutdown(): void {
  shuttingDown = true;
  stopRateLimiter();
  // No waiting for in-flight fetch/aggregation/export to complete
}
```
**Risk:** SIGTERM kills process mid-write → corrupted snapshots, partial GitHub pushes.  
**Fix:** Track in-flight promises; `await Promise.all(inFlight)` in shutdown with timeout.

---

## 🟢 Low Severity (Code Quality & DX)

### 25. **Inconsistent Error Response Format** — `src/api/middleware.ts:18-24`
```typescript
sendSuccess: { ok: true, v: "1.0", t: "...", data, meta? }
sendError:   { ok: false, v: "1.0", t: "...", error: string }
```
**Issue:** `sendError` lacks `code`, `details`, `requestId` — hard for clients to handle programmatically.  
**Fix:** Standardize error shape: `{ ok: false, error: { code, message, details?, requestId } }`.

### 26. **Console.log Used Directly in Index** — `src/index.ts:17`
```typescript
const logJson = (obj: unknown) => logger.info(JSON.stringify(obj, null, 2));
```
**Issue:** Bypasses logger structure; not configurable; pretty-prints in production logs.  
**Fix:** Use `logger.info({ ...obj })` with structured logger.

### 27. **Feature Flag Names Inconsistent** — `src/config/schema.ts:101-110`
```typescript
enableMarketFetch, enableSnapshotWrite, enableCommitPush,
enableAggregation, enableAnalytics, enableRetentionCleanup,
enableCompression, enableAlerting
```
**Issue:** Mixed prefixes (`enable*` vs `enable*`), no grouping. Hard to discover.  
**Fix:** Group by domain: `features.market.fetch`, `features.storage.snapshotWrite`, `features.git.commitPush`, etc.

### 28. **No OpenAPI/Swagger Spec** — No API documentation generation.  
**Fix:** Add `zod-to-openapi` or manual spec; serve at `/api/docs`.

### 29. **Vercel Connect Token Fetch Has No Retry** — `src/api/connectAuth.ts:7-12`
```typescript
const token = await getToken(connector, { subject: { type: "app" } });
```
**Risk:** Transient Vercel Connect failures cause token fetch to fail → empty token → GitHub push fails silently.  
**Fix:** Add retry with backoff (same pattern as `fetchWithRetry`).

### 30. **Compression Interval Calculation Uses Float Math** — `src/jobs/scheduler.ts:187-190`
```typescript
function getCompressIntervalCycles(intervalDays, fetchMinutes) {
  const cyclesPerDay = (24 * 60) / fetchMinutes;  // Float
  return Math.max(1, Math.round(intervalDays * cyclesPerDay));
}
```
**Issue:** `fetchMinutes=15` → `cyclesPerDay=96` (exact), but `fetchMinutes=7` → `205.714...` → rounding drift over time.  
**Fix:** Use integer math: `Math.ceil(intervalDays * 24 * 60 / fetchMinutes)`.

---

## 📋 Suggested Priority Order

| Priority | Issues | Effort |
|----------|--------|--------|
| **P0 (Do Now)** | #2, #3, #5, #11 | Low-Medium |
| **P1 (This Sprint)** | #1, #6, #9, #12, #13, #23 | Medium |
| **P2 (Next Sprint)** | #7, #8, #10, #14, #19, #24 | Medium-High |
| **P3 (Backlog)** | #4, #15, #16, #17, #18, #20, #21, #22, #25-30 | High |

---

## 🧪 Test Coverage Recommendations

1. **Integration tests** for all API routes (config, actions, cron, public export)
2. **Unit tests** for scheduler cycle logic (mock job functions)
3. **Contract tests** for config load/merge/reload
4. **Mock tests** for `DataRepoWriter` GitHub push (unit test both APIs)
5. **Property tests** for `shrinkResources`/`shrinkVwaps` round-trip
6. **Load test** rate limiter under concurrent requests

---

## 📦 Dependencies to Review

| Package | Version | Concern |
|---------|---------|---------|
| `express` | 5.2.1 | v5 is pre-release; breaking changes likely |
| `@vercel/connect` | 2.4.1 | Vercel-specific; locks to Vercel platform |
| `dotenv` | 16.4.7 | OK |
| `ts-node` | 10.9.2 | Deprecated; use `--loader ts-node/esm` or `tsx` |
| `vitest` | 4.1.7 | OK |

**Recommendation:** Pin `express` to `4.x` until v5 stable; evaluate `@vercel/connect` lock-in risk.

---

*Report generated by automated codebase audit. Review each finding in context before acting.*