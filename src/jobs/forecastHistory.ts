import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import { getDataRoot, loadIndexHistory } from "./intelligenceUtils.js";

export interface ForecastRecord {
  forecastTime: string;
  forecastWindow: string;
  category: string;
  predicted: number;
  actual: number | null;
  error: number | null;
  absError: number | null;
  absPctError: number | null;
  directionCorrect: boolean | null;
}

export interface AccuracyMetrics {
  mae: number;
  mape: number;
  directionalAccuracy: number;
  volatilityAdjustedAccuracy: number;
  sampleCount: number;
}

export interface ForecastAccuracyResult {
  t: string;
  r: number;
  metrics: Record<string, AccuracyMetrics>;
  recentRecords: ForecastRecord[];
  ok: boolean;
}

function loadActualValues(realm: number, category: string, targetTime: string): number | null {
  try {
    const history = loadIndexHistory(realm, 5);
    for (const h of history) {
      const v = h.ix[category]?.v;
      if (v !== undefined) return v;
    }
  } catch { }
  return null;
}

function computeMetrics(records: ForecastRecord[]): AccuracyMetrics {
  if (records.length === 0) return { mae: 0, mape: 0, directionalAccuracy: 0, volatilityAdjustedAccuracy: 0, sampleCount: 0 };
  const withActuals = records.filter((r) => r.actual !== null && r.error !== null);
  if (withActuals.length === 0) return { mae: 0, mape: 0, directionalAccuracy: 0, volatilityAdjustedAccuracy: 0, sampleCount: 0 };
  const mae = withActuals.reduce((s, r) => s + (r.absError || 0), 0) / withActuals.length;
  const mape = withActuals.reduce((s, r) => s + (r.absPctError || 0), 0) / withActuals.length;
  const dirCorrect = withActuals.filter((r) => r.directionCorrect === true).length;
  const directionalAccuracy = dirCorrect / withActuals.length;
  const volatilityAdjustedAccuracy = Math.max(0, 1 - mape / 100) * directionalAccuracy;
  return {
    mae: Math.round(mae * 100) / 100,
    mape: Math.round(mape * 100) / 100,
    directionalAccuracy: Math.round(directionalAccuracy * 100) / 100,
    volatilityAdjustedAccuracy: Math.round(volatilityAdjustedAccuracy * 100) / 100,
    sampleCount: withActuals.length,
  };
}

export function trackForecastOutcome(realm: number, forecastTime: string, forecastWindow: string, category: string, predicted: number): ForecastRecord {
  const actual = loadActualValues(realm, category, forecastTime);
  const record: ForecastRecord = {
    forecastTime, forecastWindow, category, predicted,
    actual, error: actual !== null ? predicted - actual : null,
    absError: actual !== null ? Math.abs(predicted - actual) : null,
    absPctError: actual !== null ? Math.abs((predicted - actual) / actual) * 100 : null,
    directionCorrect: null,
  };
  if (actual !== null) {
    const predictedDir = predicted >= 0 ? "up" : "down";
    const actualDir = actual >= 0 ? "up" : "down";
    record.directionCorrect = predictedDir === actualDir;
  }
  return record;
}

export function computeAccuracy(realm: number, days?: number): ForecastAccuracyResult {
  const cfg = loadConfig();
  const lookbackDays = days || cfg.forecast.accuracyDecayDays;
  const historyDir = resolve(getDataRoot(), "aggregates", "forecast-history", `realm-${realm}`);
  if (!existsSync(historyDir)) return { t: new Date().toISOString(), r: realm, metrics: {}, recentRecords: [], ok: true };
  const files = readdirSync(historyDir).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, lookbackDays);
  const allRecords: ForecastRecord[] = [];
  for (const f of files) {
    try {
      const data = JSON.parse(readFileSync(resolve(historyDir, f), "utf-8")) as { records: ForecastRecord[] };
      allRecords.push(...data.records);
    } catch { continue; }
  }
  const byCategory: Record<string, ForecastRecord[]> = {};
  for (const r of allRecords) {
    if (!byCategory[r.category]) byCategory[r.category] = [];
    byCategory[r.category].push(r);
  }
  const metrics: Record<string, AccuracyMetrics> = {};
  for (const [cat, recs] of Object.entries(byCategory)) {
    metrics[cat] = computeMetrics(recs);
  }
  metrics._overall = computeMetrics(allRecords);
  return {
    t: new Date().toISOString(), r: realm,
    metrics, recentRecords: allRecords.slice(-20).reverse(),
    ok: true,
  };
}

export function computeAllAccuracy(): Promise<{ ok: boolean; results: ForecastAccuracyResult[] }> {
  const cfg = loadConfig();
  const results = cfg.simco.realms.map((r) => {
    try { return computeAccuracy(r); }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { t: new Date().toISOString(), r, metrics: {}, recentRecords: [], ok: false };
    }
  });
  return Promise.resolve({ ok: true, results });
}
