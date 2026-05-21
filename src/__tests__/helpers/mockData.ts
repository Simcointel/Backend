import type { IndexSnapshot } from "../../jobs/intelligenceUtils.js";
import type { MomentumResult } from "../../jobs/momentumEngine.js";
import type { VolatilityResult } from "../../jobs/volatilityEngine.js";
import type { StressResult } from "../../jobs/stressEngine.js";
import type { RegimeResult } from "../../jobs/regimeEngine.js";

export const CATEGORIES = ["raw-materials", "industrial-goods", "consumer-goods", "energy-fuel", "electronics", "construction", "aerospace"];

export function makeIndexSnapshot(day: number, realm: number, basePrice = 100): IndexSnapshot {
  const seed = realm * 1000 + 42;
  const ix: Record<string, { v: number; n: number; rn: number }> = {};
  for (const cat of CATEGORIES) {
    const trend = Math.sin((day + seed) * 0.1) * 20;
    const noise = Math.sin((day * 7 + seed) % 360) * 5;
    const v = Math.max(0.01, basePrice + trend + noise + (day * 0.5));
    ix[cat] = { v, n: 1, rn: 0.01 };
  }
  const d = new Date(2024, 0, 1 + day);
  return { t: d.toISOString(), r: realm, ix };
}

export function generateIndexHistory(realm: number, days: number, basePrice = 100): IndexSnapshot[] {
  return Array.from({ length: days }, (_, i) => makeIndexSnapshot(i, realm, basePrice));
}

export function injectIndexSpike(history: IndexSnapshot[], category: string, dayIndex: number, multiplier: number): void {
  if (dayIndex < history.length && history[dayIndex].ix[category]) {
    history[dayIndex].ix[category].v *= multiplier;
  }
}

export function makeMinimalMomentumResult(realm: number): MomentumResult {
  const momentum: MomentumResult["momentum"] = {};
  for (const cat of CATEGORIES) {
    momentum[cat] = { st: 0.5, mt: 0.3, ac: 0.8, s5: 1.2, m5: 1.1, ts: 0.6 };
  }
  return { t: new Date().toISOString(), r: realm, momentum, stp: 5, mtp: 20, ok: true };
}

export function makeMinimalVolatilityResult(realm: number): VolatilityResult {
  const vol: VolatilityResult["vol"] = {};
  const sr: VolatilityResult["sr"] = {};
  for (const cat of CATEGORIES) {
    vol[cat] = { v5: 0.8, v20: 0.6, as: 1.0, is: 0.2, s5: 0.9, s20: 0.7 };
    sr[cat] = 0.5;
  }
  return { t: new Date().toISOString(), r: realm, vol, sr, ok: true };
}

export function makeMinimalStressResult(realm: number): StressResult {
  const stress: StressResult["stress"] = {};
  for (const cat of CATEGORIES) {
    stress[cat] = { ri: false, cp: false, scp: 0.3, oh: false, cs: false, flags: [] };
  }
  return { t: new Date().toISOString(), r: realm, stress, rs: { os: 0.2, af: 0, tf: 0 }, ok: true };
}

export function makeMinimalRegimeResult(realm: number): RegimeResult {
  return {
    t: new Date().toISOString(), r: realm, na: "Stagnation", sc: 50,
    mo: 0.1, vo: 15.0, ms: 40.0, rs: 5, ok: true,
  };
}

export function makeRealmConfig(realm: number, dataRepoPath: string): Record<string, unknown> {
  return {
    simco: { realms: [realm] },
    dataRepo: { path: dataRepoPath },
    macroIndexes: {
      categories: Object.fromEntries(CATEGORIES.map((c) => [
        c, { name: c.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()), description: "", resourceIds: [] },
      ])),
    },
    schedules: {
      fetchIntervalMinutes: 10, analyticsWindowSize: 20, snapshotRetentionDays: 7,
      compressionIntervalDays: 30, consecutiveFailureThreshold: 5,
    },
    featureFlags: {
      enableAnalytics: true, enableAggregation: true, enableAlerting: false,
      enableRetentionCleanup: false, enableCompression: false,
      enableRealmIntelligence: true, enableCommitPush: false,
    },
    intelligence: {
      enableRealmIntelligence: true, enableMomentum: true, enableVolatility: true,
      enableStress: true, enableRegime: true, enableLeaders: true,
      shortTermPeriods: 5, mediumTermPeriods: 20,
      volatilityShortPeriods: 5, volatilityLongPeriods: 20,
      stressThreshold: 0.3, regimeLookbackDays: 30,
      momentumTrendStrengthPeriods: 14,
      volatilityMediumPeriods: 10,
      volatilitySpikeThreshold: 2.0,
      rapidInflationThreshold: 0.05,
      collapseThreshold: -0.1,
      overheatingThreshold: 0.15,
      regimeUseStress: true,
    },
    relational: {
      enableCorrelations: true, enableAnomalies: true, enableDivergence: true,
      enableContagion: true, enableAlerting: false,
      correlationThreshold: 0.5, anomalyZScoreThreshold: 2.0,
      anomalyCriticalZScoreThreshold: 3.0,
      anomalyInflationThreshold: 0.1,
      divergenceStrengthThreshold: 0.5, contagionSpreadThreshold: 0.3,
      correlationWindow: 20,
    },
    dashboard: {
      enableDashboardPipeline: true, dashboardStoreIntervalMinutes: 10,
      webhookEnabled: false, webhookBatchDelayMs: 1000,
      scoreWeights: {
        economicHealth: { cvGrowth: 0.4, acGrowth: 0.3, regimeScore: 0.3 },
        marketSentiment: { momentum: 0.4, volatility: 0.35, trendStrength: 0.25 },
        stability: { volatilityPenalty: 0.5, stressPenalty: 0.5 },
        inflationPressure: { avgInflation: 1.0 },
        systemicRisk: { contagionIndex: 0.4, stressLevel: 0.3, anomalyCount: 0.15, regimeRisk: 0.15 },
      },
    },
    network: {
      apiVersion: "1.0", sseHeartbeatIntervalMs: 30000, sseMaxConnections: 100,
      eventBusMaxListeners: 50, enableRealtimeGateway: true, enableContractVersioning: true,
    },
    macroSettings: { enableRealmMetrics: false, enablePriceIndexes: false, enableInflationTracking: false },
    macroHistory: { enableHistoryIngestion: false, snapshotRetentionDays: 365, historyDays: 365 },
    logging: { level: "silent" },
    formulas: {},
    alerts: {},
  };
}
