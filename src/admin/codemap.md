# src/admin/

## Responsibility
Programmatic action layer shared by the CLI (`npm run admin <action>`) and the HTTP admin routes. It maps a string action to a job call and returns a normalized `AdminAction` result.

## Design
- **Command pattern via switch**: `executeAction(action, params)` is a single dispatch table. Each case returns `{ action, ok, result, error? }`; unknown actions fail soft with `unknown action`.
- **Live config editing**: `update-config` rewrites `<cwd>/config/<section>.json` with a shallow spread, then `reloadConfig()`, so changes take effect without a restart.
- **Composite actions**: `government-orders` runs the job *and* the public export so the Web frontend receives the data; `status` merges health + failure tracker + realms.

## Flow
1. CLI `admin <action> '<jsonParams>'` → `executeAction`.
2. HTTP `POST /api/actions/:action` → `handleAction` → `executeAction`.
3. Switch executes the corresponding job (`runFetch`, `runAggregation`, `retentionCleanup`, `runCompression`, `runAllGovernmentOrders`, `runPublicExportPipeline`, `runFetchRestaurantRetailInfo`, `generateHealthReport`, `reloadConfig`, `setLogLevel`).

## Files
- `index.ts` — `AdminAction`, `executeAction`. Supported actions: `fetch`, `aggregate`, `cleanup`, `compress`, `government-orders`, `public-export`, `restaurant-sync`, `status`, `reload-config`, `get-config`, `update-config`, `set-log-level`.

## Integration
- Consumers: `src/index.ts` (`admin` command), `src/api/routes/actions.ts`.
- Depends on: `src/jobs/*`, `src/config`, `src/health`, `src/logging`.
