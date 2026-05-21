import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import { getDataRoot, loadIndexHistory, loadRealmHistory } from "./intelligenceUtils.js";
import { loadLatestMomentum, loadLatestVolatility, loadLatestStress, loadLatestRegime } from "./relationalUtils.js";

export type CyclePhase = "expansion" | "speculative" | "overheating" | "contraction" | "recovery" | "stagnation";

export interface CycleDetection {
  phase: CyclePhase;
  confidence: number;
  durationDays: number;
  intensity: number;
  indicators: Record<string, number>;
}

export interface CycleRecord {
  detectedAt: string;
  phase: CyclePhase;
  duration: number;
  intensity: number;
  transition: string;
}

export interface CycleResult {
  t: string;
  r: number;
  current: CycleDetection | null;
  history: CycleRecord[];
  transitionProbabilities: Record<string, Record<string, number>>;
  stability: number;
  ok: boolean;
  error?: string;
}

function checkThresholds(values: Record<string, number>, thresholds: Record<string, number>, conditions: Record<string, string>): number {
  let matched = 0;
  let total = 0;
  for (const [key, condition] of Object.entries(conditions)) {
    total++;
    const v = values[key] ?? 0;
    const t = thresholds[key] ?? 0;
    if (condition === "min" && v >= t) matched++;
    else if (condition === "max" && v <= t) matched++;
    else if (condition === "rising" && v > 0) matched++;
  }
  return total > 0 ? matched / total : 0;
}

function detectPhase(values: Record<string, number>, cfg: import("../config/schema.js").CycleConfig): { phase: CyclePhase; confidence: number } {
  const phases: Array<{ phase: CyclePhase; match: number; thresholds: Record<string, string> }> = [
    { phase: "expansion", match: checkThresholds(values, cfg.expansionThresholds as Record<string, number>, { cvGrowthMin: "min", momentumMin: "min", inflationMax: "max", stressMax: "max" }), thresholds: {} },
    { phase: "speculative", match: checkThresholds(values, cfg.speculativeThresholds as Record<string, number>, { momentumMin: "min", volatilityMax: "max", accelerationPositive: "rising" }), thresholds: {} },
    { phase: "overheating", match: checkThresholds(values, cfg.overheatingThresholds as Record<string, number>, { inflationMin: "min", stressMin: "min", volatilityMin: "min" }), thresholds: {} },
    { phase: "contraction", match: checkThresholds(values, cfg.contractionThresholds as Record<string, number>, { cvGrowthMax: "max", momentumMin: "min", stressMin: "min" }), thresholds: {} },
    { phase: "recovery", match: checkThresholds(values, cfg.recoveryThresholds as Record<string, number>, { cvGrowthMin: "min", momentumTrendRising: "rising", stressMax: "max" }), thresholds: {} },
  ];
  phases.sort((a, b) => b.match - a.match);
  if (phases[0].match > 0) return { phase: phases[0].phase, confidence: phases[0].match };
  return { phase: "stagnation", confidence: 0.4 };
}

function calcIntensity(momentum: number, volatility: number, stress: number): number {
  return Math.min(1, Math.round((Math.abs(momentum) / 10 + volatility / 3 + stress) / 3 * 100) / 100);
}

function loadCycleHistory(realm: number): CycleRecord[] {
  const dir = resolve(getDataRoot(), "aggregates", "cycles", `realm-${realm}`);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json")).sort()
    .map((f) => {
      try { return JSON.parse(readFileSync(resolve(dir, f), "utf-8")) as CycleRecord; }
      catch { return null; }
    })
    .filter((r): r is CycleRecord => r !== null);
}

export function detectCycle(realm: number): CycleResult {
  const cfg = loadConfig();
  const cycleCfg = cfg.cycles;
  const categories = Object.keys(cfg.macroIndexes.categories);
  const momentum = loadLatestMomentum(realm);
  const volatility = loadLatestVolatility(realm);
  const stress = loadLatestStress(realm);
  const regime = loadLatestRegime(realm);
  const realmHistory = loadRealmHistory(realm);

  const avgMomentum = momentum ? Object.values(momentum).reduce((s, m) => s + (m.st || 0), 0) / Math.max(1, Object.values(momentum).length) : 0;
  const avgVol = volatility ? Object.values(volatility).reduce((s, v) => s + (v.v5 || 0), 0) / Math.max(1, Object.values(volatility).length) : 0;
  const stressLevel = stress?.rs.os || 0;
  const cvGrowth = regime?.rf.cvGrowth || 0;
  const acGrowth = regime?.rf.acGrowth || 0;
  const avgInflation = regime?.rf.avgInflation || 0;

  const values: Record<string, number> = {
    cvGrowth, acGrowth, avgInflation, avgMomentum, avgVol, stressLevel,
  };

  const detection = detectPhase(values, cycleCfg);
  const intensity = calcIntensity(avgMomentum, avgVol, stressLevel);

  const history = loadCycleHistory(realm);
  let durationDays = 0;
  if (history.length > 0) {
    const first = new Date(history[0].detectedAt);
    const last = new Date(history[history.length - 1].detectedAt);
    durationDays = Math.round((last.getTime() - first.getTime()) / 86400000);
  }

  const transitionProbabilities: Record<string, Record<string, number>> = {};
  const transitions = cycleCfg.regimeTransitionWeights;
  for (const [fromPhase, toPhases] of Object.entries(transitions)) {
    transitionProbabilities[fromPhase] = { ...toPhases };
  }

  const current: CycleDetection = {
    phase: detection.phase,
    confidence: detection.confidence,
    durationDays: Math.max(durationDays, 1),
    intensity,
    indicators: {
      cvGrowth: Math.round(cvGrowth * 100) / 100,
      avgMomentum: Math.round(avgMomentum * 100) / 100,
      avgVol: Math.round(avgVol * 100) / 100,
      stressLevel: Math.round(stressLevel * 100) / 100,
    },
  };

  const stabilityWeights = cycleCfg.cycleStabilityWeights;
  const stability = Math.min(1, Math.max(0,
    (durationDays / 365) * (stabilityWeights.duration || 0.3) +
    (1 - intensity) * (stabilityWeights.intensity || 0.3) +
    (history.length > 0 ? Math.min(1, 5 / history.length) : 0.5) * (stabilityWeights.transitionCount || 0.2) +
    (1 - avgVol / 5) * (stabilityWeights.volatility || 0.2)
  ));

  logger.info(`[realm ${realm}] Cycle: ${detection.phase} (confidence: ${detection.confidence.toFixed(2)}, intensity: ${intensity.toFixed(2)})`);
  return {
    t: new Date().toISOString(), r: realm,
    current,
    history: history.slice(-30),
    transitionProbabilities,
    stability: Math.round(stability * 100) / 100,
    ok: true,
  };
}

export function detectAllCycles(): Promise<{ ok: boolean; results: CycleResult[] }> {
  const cfg = loadConfig();
  const results = cfg.simco.realms.map((r) => {
    try { return detectCycle(r); }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { t: new Date().toISOString(), r, current: null, history: [], transitionProbabilities: {}, stability: 0, ok: false, error: msg };
    }
  });
  const allOk = results.some((r) => r.ok);
  logger.info(`Cycles detected: ${results.filter((r) => r.ok).length}/${results.length} realms ok`);
  return Promise.resolve({ ok: allOk, results });
}
