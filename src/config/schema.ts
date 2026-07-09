export interface SimcoIntelConfig {
  simco: SimcoConfig;
  dataRepo: DataRepoConfig;
  logging: LoggingConfig;
  formulas: FormulaConfig;
  schedules: ScheduleConfig;
  featureFlags: FeatureFlags;
  alerts: AlertConfig;
  macroIndexes: MacroIndexConfig;
  macroSettings: MacroSettings;
  macroHistory: MacroHistoryConfig;
}

export interface MacroIndexConfig {
  categories: Record<string, IndexCategory>;
}

export interface IndexCategory {
  name: string;
  description: string;
  resourceIds: number[];
}

export interface MacroSettings {
  enableRealmMetrics: boolean;
  enablePriceIndexes: boolean;
  enableInflationTracking: boolean;
  enableProfitMargins: boolean;
  enableSummaryIngestion: boolean;
  inflationLookbackDays: number;
  indexBaseDate: string;
  indexBaseValue: number;
  summaryHistoryDays: number;
  priceRetentionDays: number;
  enableOfficialPhaseRegime: boolean;
  useBuildingLabor: boolean;
  totalBuildingLevels: number;
}

export interface MacroHistoryConfig {
  enableHistoryIngestion: boolean;
  enableBackfill: boolean;
  backfillLookbackDays: number;
  historySyncIntervalMinutes: number;
  historyRetentionYears: number;
  archiveAfterMonths: number;
  historyPageSize: number;
  syncPageSize: number;
}

export interface SimcoConfig {
  realms: number[];
  apiBaseUrl: string;
}

export interface DataRepoConfig {
  path: string;
  githubToken: string;
  owner: string;
  repo: string;
  branch: string;
}

export interface LoggingConfig {
  level: "debug" | "info" | "warn" | "error";
}

export interface FormulaConfig {
  profitMarginThresholds: Record<string, number>;
  defaultAdminOverheadPct: number;
  defaultTransportCostMultiplier: number;
  marketFeePct: number;
  contractFeePct: number;
  contractTransportDiscountPct: number;
  robotWageReductionPct: number;
  abundanceDecayRatePerDay: number;
}

export interface ScheduleConfig {
  fetchIntervalMinutes: number;
  snapshotRetentionDays: number;
  fetchTimeoutSeconds: number;
  fetchRetryCount: number;
  fetchRetryDelayMs: number;
  consecutiveFailureThreshold: number;
  compressionIntervalDays: number;
  analyticsWindowSize: number;
}

export interface FeatureFlags {
  enableMarketFetch: boolean;
  enableSnapshotWrite: boolean;
  enableCommitPush: boolean;
  enableAggregation: boolean;
  enableAnalytics: boolean;
  enableRetentionCleanup: boolean;
  enableCompression: boolean;
  enableAlerting: boolean;
}

export interface AlertConfig {
  webhookUrl: string;
}
