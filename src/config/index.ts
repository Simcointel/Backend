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
  IntelligenceConfig,
  RelationalConfig,
  DashboardConfig,
  NetworkConfig,
  ForecastConfig,
  SimulationConfig,
  DependencyConfig,
  CycleConfig,
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
    enableSummaryIngestion: true,
    inflationLookbackDays: 30,
    indexBaseDate: "2024-01-01",
    indexBaseValue: 100,
    summaryHistoryDays: 90,
    priceRetentionDays: 7,
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

  const intelligenceDefaults: IntelligenceConfig = {
    enableRealmIntelligence: true,
    enableMomentum: true,
    enableVolatility: true,
    enableStress: true,
    enableRegime: true,
    enableLeaders: true,
    shortTermPeriods: 5,
    mediumTermPeriods: 20,
    volatilityShortPeriods: 5,
    volatilityMediumPeriods: 20,
    volatilitySpikeThreshold: 2.0,
    rapidInflationThreshold: 5.0,
    collapseThreshold: -10.0,
    overheatingThreshold: 1.15,
    regimeHistoryRetentionYears: 5,
    momentumTrendStrengthPeriods: 14,
  };

  const relationalDefaults: RelationalConfig = {
    enableRelationalPipeline: true,
    enableCorrelations: true,
    enableAnomalies: true,
    enableDivergence: true,
    enableContagion: true,
    enableAlerting: true,
    correlationWindow: 20,
    correlationMinPoints: 5,
    anomalyZScoreThreshold: 2.0,
    anomalyCriticalZScoreThreshold: 3.0,
    anomalyVolatilityZScoreThreshold: 2.0,
    anomalyInflationThreshold: 5.0,
    divergenceMomentumThreshold: 5.0,
    divergenceInflationThreshold: 3.0,
    divergenceRealmGrowthThreshold: 2.0,
    contagionInflationSpreadThreshold: 2.0,
    contagionStressCorrelationThreshold: 0.6,
    contagionVolatilitySyncThreshold: 0.7,
    alertCooldownMinutes: 60,
    alertExpiryHours: 24,
    alertWebhookUrl: "",
    maxEventsPerDay: 100,
  };

  const dashboardDefaults: DashboardConfig = {
    enableDashboardPipeline: true,
    dashboardStoreIntervalMinutes: 15,
    webhookEnabled: true,
    webhookBatchDelayMs: 500,
    scoreWeights: {
      economicHealth: { cvGrowth: 0.4, acGrowth: 0.3, regimeScore: 0.3 },
      marketSentiment: { momentum: 0.5, volatility: 0.3, trendStrength: 0.2 },
      stability: { volatilityPenalty: 0.5, stressPenalty: 0.5 },
      inflationPressure: { avgInflation: 1.0 },
      systemicRisk: { contagionIndex: 0.3, stressLevel: 0.3, anomalyCount: 0.2, regimeRisk: 0.2 },
    },
  };

  const networkDefaults: NetworkConfig = {
    apiVersion: "1.0",
    sseHeartbeatIntervalMs: 30000,
    sseMaxConnections: 100,
    eventBusMaxListeners: 50,
    enableRealtimeGateway: true,
    enableContractVersioning: true,
  };

  const configPaths = findConfigPaths();

  let formulas = formulaDefaults;
  let schedules = scheduleDefaults;
  let featureFlags = featureFlagDefaults;
  let macroIndexes: MacroIndexConfig = { categories: {} };
  let macroSettings = macroSettingsDefaults;
  let macroHistory: MacroHistoryConfig = macroHistoryDefaults;
  let intelligence = intelligenceDefaults;
  let relational = relationalDefaults;
  let dashboard = dashboardDefaults;
  let network = networkDefaults;
  let forecast: ForecastConfig | null = null;
  let simulation: SimulationConfig | null = null;
  let dependency: DependencyConfig | null = null;
  let cycles: CycleConfig | null = null;

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

    const is = loadJson<IntelligenceConfig>(basePath, "intelligenceSettings");
    if (is) intelligence = mergeWithDefaults(is, intelligenceDefaults);

    const rs = loadJson<RelationalConfig>(basePath, "relationalSettings");
    if (rs) relational = mergeWithDefaults(rs, relationalDefaults);

    const ds = loadJson<DashboardConfig>(basePath, "dashboardSettings");
    if (ds) dashboard = mergeWithDefaults(ds, dashboardDefaults);

    const ns = loadJson<NetworkConfig>(basePath, "networkSettings");
    if (ns) network = mergeWithDefaults(ns, networkDefaults);

    const fc = loadJson<ForecastConfig>(basePath, "forecastSettings");
    if (fc) forecast = fc;

    const sm = loadJson<SimulationConfig>(basePath, "simulationSettings");
    if (sm) simulation = sm;

    const dp = loadJson<DependencyConfig>(basePath, "dependencyWeights");
    if (dp) dependency = dp;

    const cc = loadJson<CycleConfig>(basePath, "cycleSettings");
    if (cc) cycles = cc;
  }

  const simco: SimcoConfig = {
    realms: parseRealmList(process.env.SIMCO_REALMS, envString("SIMCO_REALM", "0") === "0" ? [0] : [0, 1]),
    apiBaseUrl: envString("SIMCO_API_BASE_URL", "https://api.simcotools.com/v1/realms"),
  };

  const dataRepo: DataRepoConfig = {
    path: envString("DATA_REPO_PATH", "../Data"),
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

  const forecastDefaults: ForecastConfig = {
    enableForecasting: true, enableForecastPipeline: true,
    forecastWindows: ["1h", "6h", "24h", "3d", "7d"],
    forecastWindowMinutes: { "1h": 60, "6h": 360, "24h": 1440, "3d": 4320, "7d": 10080 },
    smoothingAlpha: 0.3, trendBeta: 0.1, seasonalGamma: 0.1,
    confidenceIntervalZ: 1.96, minHistoryPoints: 5, maxForecastCategories: 50,
    accuracyDecayDays: 90, enableHistoryTracking: true, enableAccuracyTracking: true,
    forecastHistoryRetentionDays: 365,
    signalThresholds: { buyPressureConfidenceMin: 0.6, overheatingZScoreMin: 2.0,
      stabilizationMomentumMax: 0.5, recoveryMomentumMin: 1.0, contractionGrowthMax: -1.0, bubbleDeviationMin: 2.5 },
  };
  if (!forecast) forecast = forecastDefaults;

  const simulationDefaults: SimulationConfig = {
    enableSimulation: true, maxSimulationSteps: 10,
    shockMagnitudeDefault: 2.0, shockMagnitudeRange: { min: 0.5, max: 5.0 },
    propagationDecayFactor: 0.5, recoveryEstimateMonths: { min: 1, max: 24 },
    scenarios: {}, sectorDependencies: {},
  };
  if (!simulation) simulation = simulationDefaults;

  const dependencyDefaults: DependencyConfig = {
    dependencyMatrix: {}, bottleneckThreshold: 0.7, criticalResourceThreshold: 0.8,
    cascadeDepthMax: 5, dependencyRiskDecay: 0.6,
    upstreamPressureWeight: 0.4, downstreamPressureWeight: 0.3, substitutabilityFactor: 0.2,
  };
  if (!dependency) dependency = dependencyDefaults;

  const cycleDefaults: CycleConfig = {
    enableCycleDetection: true, minCycleDays: 30, maxCycleDays: 730,
    expansionThresholds: { cvGrowthMin: 0.5, momentumMin: 0.5, inflationMax: 3.0, stressMax: 0.3 },
    speculativeThresholds: { momentumMin: 3.0, volatilityMax: 1.5, accelerationPositive: true },
    overheatingThresholds: { inflationMin: 3.0, stressMin: 0.4, volatilityMin: 2.0 },
    contractionThresholds: { cvGrowthMax: -0.5, momentumMin: -2.0, stressMin: 0.3 },
    recoveryThresholds: { cvGrowthMin: -0.5, momentumTrendRising: true, stressMax: 0.35 },
    regimeTransitionWeights: {}, cycleStabilityWeights: { duration: 0.3, intensity: 0.3, transitionCount: 0.2, volatility: 0.2 },
  };
  if (!cycles) cycles = cycleDefaults;

  cached = { simco, dataRepo, logging, formulas, schedules, featureFlags, alerts, macroIndexes, macroSettings, macroHistory, intelligence, relational, dashboard, network, forecast, simulation, dependency, cycles };
  return cached;
}

export function reloadConfig(): SimcoIntelConfig {
  cached = null;
  return loadConfig();
}
