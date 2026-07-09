import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { loadEnv, envString, envNumber } from "./env.js";
import type {
  SimcoIntelConfig,
  FormulaConfig,
  ScheduleConfig,
  FeatureFlags,
  SimcoConfig,
  DataRepoConfig,
  LoggingConfig,
  AlertConfig,
  MacroIndexConfig,
  MacroSettings,
  MacroHistoryConfig,
} from "./schema.js";

export type { SimcoIntelConfig } from "./schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let cached: SimcoIntelConfig | null = null;

function findConfigPaths(): string[] {
  const cwd = process.cwd();
  return [resolve(cwd, "config"), resolve(__dirname, "..", "..", "config")];
}

function loadJson<T>(basePath: string, name: string): T | null {
  const file = resolve(basePath, `${name}.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf-8")) as T;
}

function mergeWithDefaults<T>(loaded: T | null, defaults: T): T {
  return loaded ? { ...defaults, ...loaded } : defaults;
}

function parseRealmList(raw: string | undefined, fallback: number[]): number[] {
  if (!raw) return fallback;
  const parts = raw.split(",").map((s) => parseInt(s.trim(), 10));
  return parts.every((n) => !Number.isNaN(n)) ? parts : fallback;
}

export function loadConfig(): SimcoIntelConfig {
  if (cached) return cached;

  loadEnv();

  const formulaDefaults: FormulaConfig = {
    profitMarginThresholds: { good: 0.15, average: 0.05 },
    defaultAdminOverheadPct: 0,
    defaultTransportCostMultiplier: 1,
    marketFeePct: 4,
    contractFeePct: 0,
    contractTransportDiscountPct: 50,
    robotWageReductionPct: 3,
    abundanceDecayRatePerDay: 0.032,
  };

  const scheduleDefaults: ScheduleConfig = {
    fetchIntervalMinutes: 15,
    snapshotRetentionDays: 90,
    fetchTimeoutSeconds: 30,
    fetchRetryCount: 3,
    fetchRetryDelayMs: 2000,
    consecutiveFailureThreshold: 5,
    compressionIntervalDays: 7,
    analyticsWindowSize: 10,
  };

  const featureFlagDefaults: FeatureFlags = {
    enableMarketFetch: true,
    enableSnapshotWrite: true,
    enableCommitPush: false,
    enableAggregation: true,
    enableAnalytics: true,
    enableRetentionCleanup: true,
    enableCompression: true,
    enableAlerting: false,
  };

  const macroSettingsDefaults: MacroSettings = {
    enableRealmMetrics: true,
    enablePriceIndexes: true,
    enableInflationTracking: true,
    enableProfitMargins: true,
    enableSummaryIngestion: true,
    inflationLookbackDays: 30,
    indexBaseDate: "2024-01-01",
    indexBaseValue: 100,
    summaryHistoryDays: 90,
    priceRetentionDays: 7,
    enableOfficialPhaseRegime: true,
    useBuildingLabor: true,
    totalBuildingLevels: 1,
  };

  const macroHistoryDefaults: MacroHistoryConfig = {
    enableHistoryIngestion: true,
    enableBackfill: true,
    backfillLookbackDays: 365,
    historySyncIntervalMinutes: 60,
    historyRetentionYears: 5,
    archiveAfterMonths: 12,
    historyPageSize: 50,
    syncPageSize: 5,
  };

  const configPaths = findConfigPaths();

  let formulas = formulaDefaults;
  let schedules = scheduleDefaults;
  let featureFlags = featureFlagDefaults;
  let macroIndexes: MacroIndexConfig = { categories: {} };
  let macroSettings = macroSettingsDefaults;
  let macroHistory: MacroHistoryConfig = macroHistoryDefaults;

  for (const basePath of configPaths) {
    const f = loadJson<FormulaConfig>(basePath, "formulas");
    if (f) formulas = mergeWithDefaults(f, formulaDefaults);

    const s = loadJson<ScheduleConfig>(basePath, "schedules");
    if (s) schedules = mergeWithDefaults(s, scheduleDefaults);

    const ff = loadJson<FeatureFlags>(basePath, "featureFlags");
    if (ff) featureFlags = mergeWithDefaults(ff, featureFlagDefaults);

    const mi = loadJson<MacroIndexConfig>(basePath, "macroIndexes");
    if (mi) macroIndexes = mi;

    const ms = loadJson<MacroSettings>(basePath, "macroSettings");
    if (ms) macroSettings = mergeWithDefaults(ms, macroSettingsDefaults);

    const mh = loadJson<MacroHistoryConfig>(basePath, "macroHistory");
    if (mh) macroHistory = mergeWithDefaults(mh, macroHistoryDefaults);
  }

  const simco: SimcoConfig = {
    realms: parseRealmList(process.env.SIMCO_REALMS, [0, 1]),
    apiBaseUrl: envString("SIMCO_API_BASE_URL", "https://api.simcotools.com/v1/realms"),
  };

  const dataRepo: DataRepoConfig = {
    path: envString("DATA_REPO_PATH", existsSync("/tmp/data-repo") ? "/tmp/data-repo" : "../Data"),
    githubToken: envString("GITHUB_TOKEN", ""),
    owner: envString("DATA_REPO_OWNER", "SimcoIntel"),
    repo: envString("DATA_REPO_NAME", "Data"),
    branch: envString("DATA_REPO_BRANCH", "main"),
  };

  const logging: LoggingConfig = {
    level: envString("LOG_LEVEL", "info") as LoggingConfig["level"],
  };

  const alerts: AlertConfig = {
    webhookUrl: envString("ALERT_WEBHOOK_URL", ""),
  };

  cached = { simco, dataRepo, logging, formulas, schedules, featureFlags, alerts, macroIndexes, macroSettings, macroHistory };
  return cached;
}

export function reloadConfig(): SimcoIntelConfig {
  cached = null;
  return loadConfig();
}
