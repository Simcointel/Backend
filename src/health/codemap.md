# src/health/

## Responsibility
Aggregates system health into one report for the `health`/`status` CLI commands and the `/api/health` endpoint.

## Design
- **Aggregator over independent probes** returning a normalized `HealthReport`: overall status, per-component checks, scheduler uptime, failure counters, data-repo freshness.
- Two access modes: `generateHealthReport()` (async, full detail) and `printHealthSync()` (fast synchronous summary for `npm run health`).

## Flow
1. `generateHealthReport()` loads config, probes API reachability (`checkApiHealth`), data-repo presence/freshness, scheduler and failure-tracker state.
2. Result is JSON-serialized by the CLI (`src/index.ts`) or wrapped by `handleHealth` for HTTP.

## Files
- `health.ts` — `HealthReport`, `generateHealthReport`, `printHealthSync`.

## Integration
- Consumers: `src/index.ts` (`health`, `status`), `src/api/routes/health.ts`, `src/admin/index.ts` (`status` action).
- Depends on: `src/config`, `src/api/simcoTools.ts`, `src/jobs/failureTracker.ts`, `src/jobs/scheduler.ts`, `src/storage`.
