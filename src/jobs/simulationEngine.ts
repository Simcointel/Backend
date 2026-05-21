import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import { getDataRoot, loadIndexHistory } from "./intelligenceUtils.js";
import { loadLatestRegime, loadLatestVolatility, loadLatestStress } from "./relationalUtils.js";
import type { SimulationConfig, ScenarioDef } from "../config/schema.js";

export interface SimulationStep {
  step: number;
  category: string;
  shockPct: number;
  propagatedPct: number;
  regime: string;
  stress: number;
  contagion: number;
}

export interface SectorImpact {
  category: string;
  directShock: number;
  propagatedShock: number;
  totalImpact: number;
  recoveryDays: number;
}

export interface SimulationResult {
  t: string;
  r: number;
  scenario: string;
  scenarioDesc: string;
  shockMagnitude: number;
  steps: SimulationStep[];
  sectorImpacts: SectorImpact[];
  winners: string[];
  losers: string[];
  estimatedRecoveryDays: number;
  projectedRegime: string;
  ok: boolean;
  error?: string;
}

function getScenarioConfig(scenarioName: string): ScenarioDef | null {
  const cfg = loadConfig();
  const scenarios = cfg.simulation.scenarios;
  return scenarios[scenarioName] || null;
}

function propagateShock(category: string, shockPct: number, deps: Record<string, Record<string, number>>, decay: number, depth: number, maxDepth: number, visited: Set<string>): Array<{ category: string; propagatedPct: number }> {
  if (depth >= maxDepth || visited.has(category)) return [];
  visited.add(category);
  const results: Array<{ category: string; propagatedPct: number }> = [];
  const downstream = deps[category];
  if (!downstream) return results;
  for (const [depCat, weight] of Object.entries(downstream)) {
    if (visited.has(depCat)) continue;
    const propagated = shockPct * weight * Math.pow(decay, depth + 1);
    results.push({ category: depCat, propagatedPct: Math.round(propagated * 100) / 100 });
    results.push(...propagateShock(depCat, propagated, deps, decay, depth + 1, maxDepth, visited));
  }
  return results;
}

function estimateRegime(cvImpact: number, inflationImpact: number, stressImpact: number): string {
  if (cvImpact < -10 && stressImpact > 0.5) return "contraction";
  if (inflationImpact > 5 && stressImpact > 0.4) return "overheating";
  if (cvImpact > 5 && inflationImpact < 2) return "expansion";
  if (cvImpact > 10) return "boom";
  if (cvImpact < -2) return "recession";
  if (cvImpact > -1 && stressImpact < 0.3) return "recovery";
  return "stagnation";
}

function estimateRecovery(totalImpact: number, scenarioDuration: number, volatility: number): number {
  const baseRecovery = Math.max(30, Math.abs(totalImpact) * 5);
  const durationFactor = scenarioDuration * 0.3;
  const volPenalty = volatility * 20;
  return Math.round(baseRecovery + durationFactor + volPenalty);
}

function categorizeImpact(impacts: SectorImpact[]): { winners: string[]; losers: string[] } {
  const winners: string[] = [];
  const losers: string[] = [];
  for (const si of impacts) {
    if (si.totalImpact > 5) winners.push(si.category);
    else if (si.totalImpact < -5) losers.push(si.category);
  }
  winners.sort((a, b) => {
    const ia = impacts.find((i) => i.category === a);
    const ib = impacts.find((i) => i.category === b);
    return (ib?.totalImpact || 0) - (ia?.totalImpact || 0);
  });
  losers.sort((a, b) => {
    const ia = impacts.find((i) => i.category === a);
    const ib = impacts.find((i) => i.category === b);
    return (ia?.totalImpact || 0) - (ib?.totalImpact || 0);
  });
  return { winners: winners.slice(0, 3), losers: losers.slice(0, 3) };
}

export function runSimulation(realm: number, scenarioName: string, customMagnitude?: number): SimulationResult {
  const cfg = loadConfig();
  const simCfg: SimulationConfig = cfg.simulation;
  const scenario = getScenarioConfig(scenarioName);
  if (!scenario) return { t: new Date().toISOString(), r: realm, scenario: scenarioName, scenarioDesc: "", shockMagnitude: 0, steps: [], sectorImpacts: [], winners: [], losers: [], estimatedRecoveryDays: 0, projectedRegime: "unknown", ok: false, error: `unknown scenario: ${scenarioName}` };

  const shockMagnitude = customMagnitude ?? simCfg.shockMagnitudeDefault;
  const decay = simCfg.propagationDecayFactor;
  const depMatrix = cfg.dependency.dependencyMatrix;
  const maxSteps = simCfg.maxSimulationSteps;
  const deps = simCfg.sectorDependencies;
  const categories = Object.keys(cfg.macroIndexes.categories);

  const maxDepth = Math.min(maxSteps, cfg.dependency.cascadeDepthMax);
  const baseShock = scenario.shockPct * (shockMagnitude / 2.0);

  const steps: SimulationStep[] = [];
  const step0: SimulationStep = {
    step: 0, category: scenario.category, shockPct: Math.round(baseShock * 100) / 100,
    propagatedPct: 0, regime: estimateRegime(baseShock, 0, 0), stress: 0.2, contagion: 0,
  };
  steps.push(step0);

  const visited = new Set<string>();
  visited.add(scenario.category);
  const propagationTargets = scenario.category === "all"
    ? categories.filter((c) => c !== scenario.category)
    : (deps[scenario.category]?.downstream || []);

  const allPropagations: Array<{ category: string; propagatedPct: number }> = [];
  for (const target of propagationTargets) {
    if (visited.has(target)) continue;
    const weight = depMatrix[scenario.category]?.[target] || 0.3;
    const propagated = baseShock * weight * decay;
    allPropagations.push({ category: target, propagatedPct: Math.round(propagated * 100) / 100 });
    allPropagations.push(...propagateShock(target, propagated, depMatrix, decay, 1, maxDepth, visited));
  }

  const combinedImpacts: Record<string, number> = {};
  combinedImpacts[scenario.category] = baseShock;
  for (const p of allPropagations) {
    combinedImpacts[p.category] = (combinedImpacts[p.category] || 0) + p.propagatedPct;
  }

  for (let s = 0; s < Math.min(maxSteps, 5); s++) {
    for (const [cat, impact] of Object.entries(combinedImpacts)) {
      if (s === 0) {
        steps.push({
          step: s + 1, category: cat, shockPct: 0,
          propagatedPct: Math.round(impact * 100) / 100,
          regime: estimateRegime(impact, impact * 0.1, Math.abs(impact) / 100),
          stress: Math.min(1, Math.round(Math.abs(impact) / 50 * 100) / 100),
          contagion: Math.min(1, Math.round(Math.abs(impact) / 100 * 100) / 100),
        });
      }
    }
  }

  const totalCVImpact = Object.values(combinedImpacts).reduce((a, b) => a + b, 0) / Math.max(1, Object.keys(combinedImpacts).length);
  const latestRegime = loadLatestRegime(realm);
  const latestVolatility = loadLatestVolatility(realm);
  const avgVol = latestVolatility ? Object.values(latestVolatility).reduce((s, v) => s + v.v5, 0) / Object.values(latestVolatility).length : 1;
  const projectedRegime = estimateRegime(totalCVImpact, totalCVImpact * 0.1, Math.abs(totalCVImpact) / 50);

  const sectorImpacts: SectorImpact[] = categories.map((cat) => {
    const direct = cat === scenario.category ? baseShock : 0;
    const propagated = combinedImpacts[cat] || 0;
    const weightFromAll = categories.reduce((s, c) => s + (depMatrix[c]?.[cat] || 0), 0);
    const total = direct + propagated;
    const recoveryDays = estimateRecovery(total, scenario.durationDays, avgVol);
    return {
      category: cat,
      directShock: Math.round(direct * 100) / 100,
      propagatedShock: Math.round(propagated * 100) / 100,
      totalImpact: Math.round(total * 100) / 100,
      recoveryDays,
    };
  });

  const { winners, losers } = categorizeImpact(sectorImpacts);

  const recoveryDays = Math.max(sectorImpacts.reduce((s, i) => s + i.recoveryDays, 0) / sectorImpacts.length, 30);

  logger.info(`[realm ${realm}] Simulation '${scenarioName}': ${sectorImpacts.length} sectors, recovery ~${Math.round(recoveryDays)}d`);
  return {
    t: new Date().toISOString(), r: realm, scenario: scenarioName,
    scenarioDesc: scenario.description, shockMagnitude: Math.round(shockMagnitude * 100) / 100,
    steps, sectorImpacts, winners, losers,
    estimatedRecoveryDays: Math.round(recoveryDays),
    projectedRegime, ok: true,
  };
}

export function runAllSimulations(realm: number): { ok: boolean; results: SimulationResult[] } {
  const cfg = loadConfig();
  const scenarioNames = Object.keys(cfg.simulation.scenarios);
  const results = scenarioNames.map((name) => {
    try { return runSimulation(realm, name); }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { t: new Date().toISOString(), r: realm, scenario: name, scenarioDesc: "", shockMagnitude: 0, steps: [], sectorImpacts: [], winners: [], losers: [], estimatedRecoveryDays: 0, projectedRegime: "unknown", ok: false, error: msg };
    }
  });
  const allOk = results.some((r) => r.ok);
  return { ok: allOk, results };
}
