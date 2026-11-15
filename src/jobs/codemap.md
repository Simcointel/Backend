# src/jobs/

## Responsibility
Owns the entire data lifecycle of the backend: fetching Sim Companies market data, validating it, computing aggregates/analytics, writing snapshots to the flat-file Data repo, and exporting the public JSON datasets the Web frontend consumes.

## Design
- **Two entry styles.** `run*` / `runAll*` functions are callable units (used by CLI, HTTP, admin). `scheduler.ts` is the long-running orchestrator that sequences them per cycle.
- **Fixed pipeline stages per cycle:** fetch → aggregate → profit margins → macro history sync → government orders (weekly) → restaurant retail info (every 4th cycle) → public export → compression (periodic).
- **Config-as-data.** Intervals, retention, feature flags and thresholds come from `loadConfig()`; nothing is hard-coded per environment.
- **Per-realm fan-out.** Most `runAll*` functions loop `cfg.simco.realms` and return `{ ok, results }`; aggregation uses `Promise.allSettled` so one realm cannot abort the cycle.
- **Validation gate before publish.** `validation.ts#validatePublicDataset(type, data)` blocks malformed datasets from reaching the public repo (e.g. mostly-zero prices).
- **Resilience helpers:** `fetchWithRetry`, `sleep`, `failureTracker` (consecutive failure counter), `eventBus.emit` lifecycle events, `shuttingDown` flag checked inside the inter-cycle sleep.

## Flow
1. `startScheduler()` (src/jobs/scheduler.ts) loads the persisted cycle counter from GitHub (`meta/scheduler-cycle.json`), then loops `while (!shuttingDown)`.
2. Each cycle calls `emit("scheduler:cycle-start")` → `runFetch()` → `recordFetchResult(ok)`.
3. `runAggregation(cfg.dataRepo.path, realm)` reduces raw snapshots into `aggregates/market/realm-N`.
4. `runAllProfitMargins()` → `computeProfitMargins(realm)` reads the latest market snapshot, builds resource/VWAP maps, computes deltas/projections.
5. `runAllHistorySync()` → `macroHistory.ts` appends daily entries to yearly history files.
6. `runPublicExportPipeline()` (publicExportPipeline.ts) is the terminal stage: runs `runMacroPipeline`, optionally `runAllGovernmentOrders`, per realm writes `macro.json`, `history.json`, `indexes.json`, `inflation.json`, `margins.json`, `government-orders.json`, `retail.json`, then `manifest.json`, then `DataRepoWriter.commitAndPush` when `featureFlags.enableCommitPush`.
7. `sleep(intervalMs)` at the end of the cycle, interruption-aware via `shuttingDown`.

## Files
- `scheduler.ts` — cycle orchestrator, signal handling, uptime/state, cycle-counter persistence to GitHub.
- `fetchJob.ts` — `runFetch`/`runFetchForRealm`, retry+sleep helpers, resource/VWAP shrinking, writes `snapshots/market/realm-N`.
- `aggregate.ts` — `runAggregation`: rolls raw snapshots into `aggregates/market/realm-N`.
- `profitMargins.ts` — margin computation from latest snapshot, VWAP selection, deltas vs previous files, projections.
- `macroPipeline.ts` — `runMacroPipeline`: realm metrics + indexes + inflation + history in one call.
- `macroHistory.ts` — yearly history files, backfill state, sync, and archive to `archives/macro/`.
- `macroInflation.ts` — `runInflationTracking` per realm from index history.
- `priceIndex.ts` — `runPriceIndexes` category index computation and snapshots.
- `realmMetrics.ts` — `runRealmMetrics` realm-level KPI extraction.
- `governmentOrders.ts` — fetch/compute government orders and persist snapshots.
- `restaurantRetailInfo.ts` — restaurant quality/retail datapoints fetch plus `calculateRestaurantMenu`.
- `retailSummary.ts` — daily retail aggregate written to `aggregates/retail/realm-N`.
- `validation.ts` — dataset sanity gate used by the public exporter.
- `compress.ts` — monthly compression of old snapshots.
- `cleanup.ts` — retention-based deletion of expired snapshots.
- `failureTracker.ts` — in-memory consecutive failure / last failure status.
- `intelligenceUtils.ts` — `getDataRoot()` plus readers for index/inflation/history snapshots.
- `relationalUtils.ts` — cross-dataset readers (momentum, volatility, stress, regime) and event/severity helpers.

## Integration
- Invoked by: `src/index.ts` (CLI), `src/api/routes/cron.ts`, `src/api/routes/actions.ts`, `src/admin/index.ts`.
- Depends on: `src/storage/dataRepoWriter.ts`, `src/api/routes/publicData.ts` (readers used by the exporter), `src/api/simcoTools.ts` (upstream HTTP client), `src/config`, `src/logging`, `src/events`.
- Writes into the Data repo layout: `snapshots/`, `aggregates/`, `archives/`, `state/`, and `public/realm-N/*.json`.
