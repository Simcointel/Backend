import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import { getDataRoot, loadIndexHistory, loadInflationHistory } from "./intelligenceUtils.js";
import { loadLatestMomentum, loadLatestVolatility, loadLatestStress, loadLatestRegime } from "./relationalUtils.js";

export type SignalType = "buy-pressure" | "overheating" | "stabilization" | "recovery" | "contraction" | "speculative-bubble";

export interface StrategicSignal {
  type: SignalType;
  label: string;
  confidence: number;
  severity: "low" | "medium" | "high" | "critical";
  indicators: string[];
  affectedSectors: string[];
  estimatedDurationDays: number;
  timestamp: string;
}

export interface SignalResult {
  t: string;
  r: number;
  signals: StrategicSignal[];
  ok: boolean;
  error?: string;
}

function calcZScore(values: number[], latest: number): number {
  if (values.length < 3) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return (latest - mean) / std;
}

function calcDirectionalConsistency(values: number[]): number {
  if (values.length < 3) return 0.5;
  let up = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i - 1]) up++;
  }
  return up / (values.length - 1);
}

export function generateSignals(realm: number): SignalResult {
  const cfg = loadConfig();
  const thresholds = cfg.forecast.signalThresholds;
  const signals: StrategicSignal[] = [];
  const categories = Object.keys(cfg.macroIndexes.categories);

  const momentum = loadLatestMomentum(realm);
  const volatility = loadLatestVolatility(realm);
  const stress = loadLatestStress(realm);
  const regime = loadLatestRegime(realm);
  const history = loadIndexHistory(realm, 30);
  const inflationHistory = loadInflationHistory(realm, 30);

  const avgMomentum = momentum ? Object.values(momentum).reduce((s, m) => s + (m.st || 0), 0) / Math.max(1, Object.values(momentum).length) : 0;
  const avgVol = volatility ? Object.values(volatility).reduce((s, v) => s + (v.v5 || 0), 0) / Math.max(1, Object.values(volatility).length) : 0;
  const stressLevel = stress?.rs.os || 0;
  const regimeLabel = regime?.cr || "unknown";
  const cvGrowth = regime?.rf.cvGrowth || 0;

  for (const cat of categories) {
    const catValues = history.map((h) => h.ix[cat]?.v).filter((v): v is number => v !== undefined && v > 0);
    if (catValues.length < 5) continue;
    const latest = catValues[catValues.length - 1];
    const zScore = calcZScore(catValues, latest);
    const consistency = calcDirectionalConsistency(catValues);
    const catMomentum = momentum?.[cat]?.st || 0;
    const catVol = volatility?.[cat]?.v5 || 0;

    if (catMomentum > 0 && zScore < -1.5 && consistency > 0.6 && avgVol < thresholds.overheatingZScoreMin) {
      signals.push({
        type: "buy-pressure",
        label: `Buy pressure detected in ${cat}`,
        confidence: Math.min(1, Math.round((Math.abs(zScore) / 3 + consistency) * 50) / 100),
        severity: "medium",
        indicators: [`z-score: ${zScore.toFixed(2)}`, `momentum: ${catMomentum.toFixed(2)}`, `direction-consistency: ${(consistency * 100).toFixed(0)}%`],
        affectedSectors: [cat],
        estimatedDurationDays: 7,
        timestamp: new Date().toISOString(),
      });
    }

    if (zScore > thresholds.overheatingZScoreMin && catVol > 2) {
      signals.push({
        type: "overheating",
        label: `Overheating warning in ${cat}`,
        confidence: Math.min(1, Math.round((zScore / 4) * 100) / 100),
        severity: zScore > 3 ? "high" : "medium",
        indicators: [`z-score: ${zScore.toFixed(2)}`, `volatility: ${catVol.toFixed(2)}`, `deviation from mean`],
        affectedSectors: [cat],
        estimatedDurationDays: 14,
        timestamp: new Date().toISOString(),
      });
    }

    if (Math.abs(catMomentum) < thresholds.stabilizationMomentumMax && catVol < 0.5 && consistency > 0.4 && consistency < 0.6) {
      signals.push({
        type: "stabilization",
        label: `Stabilization signal in ${cat}`,
        confidence: Math.round((1 - catVol) * 100) / 100,
        severity: "low",
        indicators: [`momentum: ${catMomentum.toFixed(2)}`, `volatility: ${catVol.toFixed(2)}`, `mixed direction`],
        affectedSectors: [cat],
        estimatedDurationDays: 5,
        timestamp: new Date().toISOString(),
      });
    }

    if (catMomentum > thresholds.recoveryMomentumMin && consistency > 0.6 && stressLevel < 0.3) {
      signals.push({
        type: "recovery",
        label: `Recovery signal in ${cat}`,
        confidence: Math.min(1, Math.round((catMomentum / 5 + (1 - stressLevel)) * 50) / 100),
        severity: "medium",
        indicators: [`momentum: ${catMomentum.toFixed(2)}`, `stress: ${(stressLevel * 100).toFixed(0)}%`, `up-trend consistency`],
        affectedSectors: [cat],
        estimatedDurationDays: 30,
        timestamp: new Date().toISOString(),
      });
    }
  }

  if (cvGrowth < thresholds.contractionGrowthMax && stressLevel > 0.3) {
    signals.push({
      type: "contraction",
      label: "Broad contraction warning",
      confidence: Math.min(1, Math.round(Math.abs(cvGrowth) / 5 + stressLevel) * 100 / 100),
      severity: "high",
      indicators: [`cv-growth: ${cvGrowth.toFixed(2)}%`, `stress: ${(stressLevel * 100).toFixed(0)}%`, `regime: ${regimeLabel}`],
      affectedSectors: categories,
      estimatedDurationDays: 90,
      timestamp: new Date().toISOString(),
    });
  }

  const maxZ = categories.reduce((max, cat) => {
    const vals = history.map((h) => h.ix[cat]?.v).filter((v): v is number => v !== undefined);
    if (vals.length < 5) return max;
    return Math.max(max, calcZScore(vals, vals[vals.length - 1]));
  }, 0);

  if (maxZ > thresholds.bubbleDeviationMin && avgVol < 1.5 && avgMomentum > 2) {
    signals.push({
      type: "speculative-bubble",
      label: "Speculative bubble warning",
      confidence: Math.min(1, Math.round((maxZ / 4) * 100) / 100),
      severity: "critical",
      indicators: [`max-z-score: ${maxZ.toFixed(2)}`, `avg-momentum: ${avgMomentum.toFixed(2)}`, `low volatility with high momentum`],
      affectedSectors: categories,
      estimatedDurationDays: 60,
      timestamp: new Date().toISOString(),
    });
  }

  signals.sort((a, b) => {
    const sevOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    return (sevOrder[b.severity] || 0) - (sevOrder[a.severity] || 0);
  });

  logger.info(`[realm ${realm}] Signals: ${signals.length} generated`);
  return { t: new Date().toISOString(), r: realm, signals, ok: true };
}

export function generateAllSignals(): Promise<{ ok: boolean; results: SignalResult[] }> {
  const cfg = loadConfig();
  const results = cfg.simco.realms.map((r) => {
    try { return generateSignals(r); }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { t: new Date().toISOString(), r, signals: [], ok: false, error: msg };
    }
  });
  const allOk = results.some((r) => r.ok);
  logger.info(`All signals: ${results.filter((r) => r.ok).length}/${results.length} realms ok`);
  return Promise.resolve({ ok: allOk, results });
}
