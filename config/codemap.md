# config/

## Responsibility
The on-disk configuration surface: JSON files that operators (and the admin UI) edit to tune formulas, schedules, feature flags and macro/government pipelines. These are *data* files consumed by `src/config/index.ts`.

## Design
- **Config as data, merged over code defaults.** Any key missing here falls back to `src/config/index.ts` defaults; any key present here overrides them. Arrays replace, objects deep-merge.
- **Per-section files** so the admin UI can update one section without rewriting others (`update-config` spreads new values into the existing JSON).
- **Realms are not configured here** — they come from the `SIMCO_REALMS` env var.

## Flow
1. `loadConfig()` searches `<cwd>/config` then `<repo>/config` and reads every file below.
2. `deepMerge(defaults, file)` per section; `macroIndexes.json` is used as-is (no merge).
3. `reloadConfig()` (admin `reload-config`, config update, server boot) re-reads all files.

## Files
- `formulas.json` — economics constants: `profitMarginThresholds`, `defaultAdminOverheadPct`, `defaultTransportCostMultiplier`, `marketFeePct`, `contractFeePct`, `contractTransportDiscountPct`, `robotWageReductionPct`, `abundanceDecayRatePerDay`.
- `schedules.json` — `fetchIntervalMinutes`, `snapshotRetentionDays`, `fetchTimeoutSeconds`, `fetchRetryCount`, `fetchRetryDelayMs`, `consecutiveFailureThreshold`, `compressionIntervalDays`, `analyticsWindowSize`.
- `featureFlags.json` — toggles: `enableMarketFetch`, `enableSnapshotWrite`, `enableCommitPush`, `enableAggregation`, `enableAnalytics`, `enableRetentionCleanup`, `enableCompression`, `enableAlerting`.
- `macroSettings.json` — realm metrics/index/inflation/margin toggles, `inflationLookbackDays`, `indexBaseDate`, `indexBaseValue`, `summaryHistoryDays`, `priceRetentionDays`, labor flags.
- `macroHistory.json` — history ingestion/backfill toggles, lookback days, retention years, archive threshold, page sizes.
- `macroIndexes.json` — category → `{ name, description, resourceIds[] }` mapping used to build price indexes.
- `governmentOrders.json` — enable flag and weekly fetch schedule (`fetchDayOfWeek`, `fetchHourUtc`, `fetchMinuteUtc`).

## Integration
- Reader: `src/config/index.ts#loadConfig()` / `reloadConfig()`.
- Edited at runtime by: `src/admin/index.ts` (`update-config`) and `src/api/routes/config.ts`.
- Consumed indirectly by every job via `SimcoIntelConfig`.
