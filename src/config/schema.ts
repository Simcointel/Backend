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
  intelligence: IntelligenceConfig;
  relational: RelationalConfig;
  dashboard: DashboardConfig;
  network: NetworkConfig;
  forecast: ForecastConfig;
  simulation: SimulationConfig;
  dependency: DependencyConfig;
  cycles: CycleConfig;
}

export interface NetworkConfig {
  apiVersion: string;
  sseHeartbeatIntervalMs: number;
  sseMaxConnections: number;
  eventBusMaxListeners: number;
  enableRealtimeGateway: boolean;
  enableContractVersioning: boolean;
}

export interface DashboardConfig {
  enableDashboardPipeline: boolean;
  dashboardStoreIntervalMinutes: number;
  webhookEnabled: boolean;
  webhookBatchDelayMs: number;
  scoreWeights: {
    economicHealth: { cvGrowth: number; acGrowth: number; regimeScore: number };
    marketSentiment: { momentum: number; volatility: number; trendStrength: number };
    stability: { volatilityPenalty: number; stressPenalty: number };
    inflationPressure: { avgInflation: number };
    systemicRisk: { contagionIndex: number; stressLevel: number; anomalyCount: number; regimeRisk: number };
  };
}

export interface IntelligenceConfig {
  enableRealmIntelligence: boolean;
  enableMomentum: boolean;
  enableVolatility: boolean;
  enableStress: boolean;
  enableRegime: boolean;
  enableLeaders: boolean;
  shortTermPeriods: number;
  mediumTermPeriods: number;
  volatilityShortPeriods: number;
  volatilityMediumPeriods: number;
  volatilitySpikeThreshold: number;
  rapidInflationThreshold: number;
  collapseThreshold: number;
  overheatingThreshold: number;
  regimeHistoryRetentionYears: number;
  momentumTrendStrengthPeriods: number;
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

export interface RelationalConfig {
  enableRelationalPipeline: boolean;
  enableCorrelations: boolean;
  enableAnomalies: boolean;
  enableDivergence: boolean;
  enableContagion: boolean;
  enableAlerting: boolean;
  correlationWindow: number;
  correlationMinPoints: number;
  anomalyZScoreThreshold: number;
  anomalyCriticalZScoreThreshold: number;
  anomalyVolatilityZScoreThreshold: number;
  anomalyInflationThreshold: number;
  divergenceMomentumThreshold: number;
  divergenceInflationThreshold: number;
  divergenceRealmGrowthThreshold: number;
  contagionInflationSpreadThreshold: number;
  contagionStressCorrelationThreshold: number;
  contagionVolatilitySyncThreshold: number;
  alertCooldownMinutes: number;
  alertExpiryHours: number;
  alertWebhookUrl: string;
  maxEventsPerDay: number;
}

export interface AlertConfig {
  webhookUrl: string;
}

export interface ForecastConfig {
  enableForecasting: boolean;
  enableForecastPipeline: boolean;
  forecastWindows: string[];
  forecastWindowMinutes: Record<string, number>;
  smoothingAlpha: number;
  trendBeta: number;
  seasonalGamma: number;
  confidenceIntervalZ: number;
  minHistoryPoints: number;
  maxForecastCategories: number;
  accuracyDecayDays: number;
  enableHistoryTracking: boolean;
  enableAccuracyTracking: boolean;
  forecastHistoryRetentionDays: number;
  signalThresholds: {
    buyPressureConfidenceMin: number;
    overheatingZScoreMin: number;
    stabilizationMomentumMax: number;
    recoveryMomentumMin: number;
    contractionGrowthMax: number;
    bubbleDeviationMin: number;
  };
}

export interface ScenarioDef {
  category: string;
  shockPct: number;
  durationDays: number;
  description: string;
}

export interface SectorDependency {
  downstream: string[];
  upstream: string[];
  weight: number;
}

export interface SimulationConfig {
  enableSimulation: boolean;
  maxSimulationSteps: number;
  shockMagnitudeDefault: number;
  shockMagnitudeRange: { min: number; max: number };
  propagationDecayFactor: number;
  recoveryEstimateMonths: { min: number; max: number };
  scenarios: Record<string, ScenarioDef>;
  sectorDependencies: Record<string, SectorDependency>;
}

export interface DependencyConfig {
  dependencyMatrix: Record<string, Record<string, number>>;
  bottleneckThreshold: number;
  criticalResourceThreshold: number;
  cascadeDepthMax: number;
  dependencyRiskDecay: number;
  upstreamPressureWeight: number;
  downstreamPressureWeight: number;
  substitutabilityFactor: number;
}

export interface CyclePhaseThresholds {
  cvGrowthMin?: number;
  cvGrowthMax?: number;
  momentumMin?: number;
  momentumMax?: number;
  momentumTrendRising?: boolean;
  accelerationPositive?: boolean;
  inflationMin?: number;
  inflationMax?: number;
  stressMin?: number;
  stressMax?: number;
  volatilityMin?: number;
  volatilityMax?: number;
}

export interface CycleConfig {
  enableCycleDetection: boolean;
  minCycleDays: number;
  maxCycleDays: number;
  expansionThresholds: CyclePhaseThresholds;
  speculativeThresholds: CyclePhaseThresholds;
  overheatingThresholds: CyclePhaseThresholds;
  contractionThresholds: CyclePhaseThresholds;
  recoveryThresholds: CyclePhaseThresholds;
  regimeTransitionWeights: Record<string, Record<string, number>>;
  cycleStabilityWeights: Record<string, number>;
}
