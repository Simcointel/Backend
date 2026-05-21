import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { resolve, join } from "path";
import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import { loadRealmHistory, getDataRoot } from "./intelligenceUtils.js";
import { computeMomentum, type MomentumResult } from "./momentumEngine.js";
import { computeVolatility, type VolatilityResult } from "./volatilityEngine.js";
import { computeStress, type StressResult } from "./stressEngine.js";

export type RegimeLabel = "expansion" | "boom" | "overheating" | "contraction" | "recovery" | "stagnation";

export interface RegimeFactors {
  cvGrowth: number;
  acGrowth: number;
  avgInflation: number;
  avgStress: number;
  avgVolatility: number;
  phase: string;
}

export interface RegimeResult {
  t: string;
  r: number;
  cr: RegimeLabel;
  pr: RegimeLabel | null;
  rc: number;
  rf: RegimeFactors;
  ok: boolean;
  error?: string;
}

interface RegimeHistoryEntry {
  d: string;
  rg: RegimeLabel;
  rc: number;
  pr: RegimeLabel | null;
}

interface RegimeYearFile {
  r: number;
  y: number;
  e: RegimeHistoryEntry[];
}

function classifyRegime(factors: RegimeFactors): { regime: RegimeLabel; confidence: number } {
  const { cvGrowth, acGrowth, avgInflation, avgStress, avgVolatility, phase } = factors;

  if (cvGrowth > 3 && avgInflation > 3 && avgVolatility > 2 && avgStress > 0.4) {
    return { regime: "overheating", confidence: 0.85 };
  }

  if (phase === "recession" && cvGrowth < -1 && avgStress > 0.3) {
    return { regime: "contraction", confidence: 0.9 };
  }

  if (cvGrowth > 1.5 && avgInflation > 1.5 && avgStress < 0.3 && avgVolatility < 1.5) {
    return { regime: "boom", confidence: 0.8 };
  }

  if (cvGrowth > 0.5 && acGrowth > 0 && avgInflation < 2 && avgStress < 0.25) {
    return { regime: "expansion", confidence: 0.75 };
  }

  if (cvGrowth > -1 && cvGrowth < 1 && avgInflation < 1 && avgVolatility < 1 && avgStress < 0.2) {
    return { regime: "stagnation", confidence: 0.7 };
  }

  if (cvGrowth > -0.5 && avgStress < 0.35) {
    return { regime: "recovery", confidence: 0.65 };
  }

  return { regime: "stagnation", confidence: 0.5 };
}

function loadRegimeYearFile(realm: number, year: number): RegimeYearFile | null {
  const p = resolve(getDataRoot(), "aggregates", "regimes", `realm-${realm}`, `${year}.json`);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as RegimeYearFile;
  } catch {
    return null;
  }
}

function appendRegimeEntry(realm: number, entry: RegimeHistoryEntry): void {
  const year = parseInt(entry.d.slice(0, 4), 10);
  const dir = resolve(getDataRoot(), "aggregates", "regimes", `realm-${realm}`);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const p = resolve(dir, `${year}.json`);
  const existing = loadRegimeYearFile(realm, year);
  const entries = existing ? existing.e.slice() : [];

  const idx = entries.findIndex((e) => e.d === entry.d);
  if (idx >= 0) {
    entries[idx] = entry;
  } else {
    entries.push(entry);
  }

  entries.sort((a, b) => a.d.localeCompare(b.d));
  const file: RegimeYearFile = { r: realm, y: year, e: entries };
  writeFileSync(p, JSON.stringify(file) + "\n", "utf-8");
}

export function computeRegime(realm: number, momentumResult?: MomentumResult, volatilityResult?: VolatilityResult, stressResult?: StressResult): RegimeResult {
  const cfg = loadConfig();
  const realmHistory = loadRealmHistory(realm);
  const recentHistory = realmHistory.slice(-30);

  const momentum = momentumResult || computeMomentum(realm);
  const volatility = volatilityResult || computeVolatility(realm);
  const stress = stressResult || computeStress(realm, momentum, volatility);

  let cvGrowth = 0;
  let acGrowth = 0;
  let latestPhase = "unknown";
  if (recentHistory.length >= 2) {
    const latest = recentHistory[recentHistory.length - 1];
    const past = recentHistory[0];
    cvGrowth = past.cv > 0 ? ((latest.cv - past.cv) / past.cv) * 100 : 0;
    acGrowth = past.ac > 0 ? ((latest.ac - past.ac) / past.ac) * 100 : 0;
    latestPhase = latest.ph || "unknown";
  }

  const catMomenta = Object.values(momentum.momentum).map((m) => m.st);
  const avgMomentum = catMomenta.length > 0
    ? catMomenta.reduce((s, v) => s + v, 0) / catMomenta.length
    : 0;

  const catVols = Object.values(volatility.vol).map((v) => v.v5);
  const avgVol = catVols.length > 0
    ? catVols.reduce((s, v) => s + v, 0) / catVols.length
    : 0;

  const avgInflation = avgMomentum;

  const factors: RegimeFactors = {
    cvGrowth: Math.round(cvGrowth * 100) / 100,
    acGrowth: Math.round(acGrowth * 100) / 100,
    avgInflation: Math.round(avgInflation * 100) / 100,
    avgStress: stress.rs.os,
    avgVolatility: Math.round(avgVol * 100) / 100,
    phase: latestPhase,
  };

  const { regime, confidence } = classifyRegime(factors);

  const cfgYear = new Date().getFullYear().toString();
  const regimeYearFile = loadRegimeYearFile(realm, parseInt(cfgYear, 10));
  const allPrev = regimeYearFile ? regimeYearFile.e : [];
  const previousRegime = allPrev.length > 0 ? allPrev[allPrev.length - 1].rg : null;

  const today = new Date().toISOString().slice(0, 10);
  appendRegimeEntry(realm, { d: today, rg: regime, rc: Math.round(confidence * 100) / 100, pr: previousRegime });

  logger.info(`[realm ${realm}] Regime: ${regime} (confidence: ${confidence.toFixed(2)}), previous: ${previousRegime || "none"}`);

  return {
    t: new Date().toISOString(), r: realm,
    cr: regime, pr: previousRegime,
    rc: Math.round(confidence * 100) / 100,
    rf: factors,
    ok: true,
  };
}

export function computeAllRegimes(): Promise<{ ok: boolean; results: RegimeResult[] }> {
  const cfg = loadConfig();
  const results = cfg.simco.realms.map((r) => {
    try {
      const momentum = computeMomentum(r);
      const volatility = computeVolatility(r);
      const stress = computeStress(r, momentum, volatility);
      return computeRegime(r, momentum, volatility, stress);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { t: new Date().toISOString(), r, cr: "stagnation" as RegimeLabel, pr: null, rc: 0, rf: { cvGrowth: 0, acGrowth: 0, avgInflation: 0, avgStress: 0, avgVolatility: 0, phase: "unknown" }, ok: false, error: msg };
    }
  });
  const allOk = results.every((r) => r.ok);
  logger.info(`Regimes computed: ${results.filter((r) => r.ok).length}/${results.length} realms ok`);
  return Promise.resolve({ ok: allOk, results });
}

export function loadRegimeHistory(realm: number): RegimeHistoryEntry[] {
  const dir = resolve(getDataRoot(), "aggregates", "regimes", `realm-${realm}`);
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

  const all: RegimeHistoryEntry[] = [];
  for (const f of files) {
    try {
      const yf = JSON.parse(readFileSync(join(dir, f), "utf-8")) as RegimeYearFile;
      all.push(...yf.e);
    } catch { /* skip */ }
  }

  all.sort((a, b) => a.d.localeCompare(b.d));
  return all;
}
