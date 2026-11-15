# src/config/

## Responsibility
Single source of runtime configuration: `.env` loading, typed schema, JSON config-file merge, and the cached `SimcoIntelConfig` object consumed by every job.

## Design
- **Layered merge (precedence: defaults → config/*.json → env vars).** `deepMerge` fills missing keys; arrays are replaced wholesale.
- **Dual config search path**: `<cwd>/config` then `<module>/../../config`, so both `ts-node src` and compiled `dist/src` resolve the same files.
- **Module-level cache** (`cached`) with `reloadConfig()` as the invalidation hook — used by the admin config editor and on server boot.
- **Typed schema module** (`schema.ts`) declares `SimcoIntelConfig` and every section interface; `env.ts` provides typed env readers with fallbacks.

## Flow
1. `loadConfig()` → `loadEnv()` (dotenv).
2. Parse `SIMCO_REALMS` via `parseRealmList` (fallback `[0,1]`).
3. For each config path, read `formulas.json`, `schedules.json`, `featureFlags.json`, `macroIndexes.json`, `macroSettings.json`, `macroHistory.json`, `governmentOrders.json` and `deepMerge` onto defaults.
4. Assemble `{ simco, dataRepo, logging, formulas, schedules, featureFlags, alerts, macroIndexes, macroSettings, macroHistory, governmentOrders }`, cache, return.
5. `reloadConfig()` clears the cache and resets the `DataRepoWriter` singleton so new credentials/paths take effect.

## Files
- `schema.ts` — all config interfaces (`SimcoIntelConfig`, `FormulaConfig`, `ScheduleConfig`, `FeatureFlags`, `MacroSettings`, `MacroHistoryConfig`, `GovernmentOrdersConfig`, `DataRepoConfig`, `LoggingConfig`, `AlertConfig`, `MacroIndexConfig`, `IndexCategory`, `SimcoConfig`).
- `index.ts` — `loadConfig()`, `reloadConfig()`, defaults, `deepMerge`, `findConfigPaths`.
- `env.ts` — `loadEnv()`, `envString`, `envNumber`, `envBool`.

## Integration
- Consumers: virtually every module (`src/jobs/*`, `src/api/*`, `src/storage/*`, `src/health/*`, `src/index.ts`).
- Reads: `config/*.json` at repo root; env keys `SIMCO_REALMS`, `SIMCO_API_BASE_URL`, `DATA_REPO_PATH`, `GITHUB_TOKEN`, `DATA_REPO_OWNER`, `DATA_REPO_NAME`, `DATA_REPO_BRANCH`, `LOG_LEVEL`, `ALERT_WEBHOOK_URL`.
