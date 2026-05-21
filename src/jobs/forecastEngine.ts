import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { resolve, join } from "path";
import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import { getDataRoot, loadIndexHistory, loadInflationHistory } from "./intelligenceUtils.js";
import { loadLatestMomentum } from "./relationalUtils.js";

export interface ForecastPoint {
  t: string;
  v: number;
  cl: number;
  cu: number;
}

export interface ForecastSeries {
  category: string;
  history: number[];
  fc: ForecastPoint[];
  method: string;
  trend: number;
  volatility: number;
  reliability: number;
}

export interface ForecastResult {
  t: string;
  r: number;
  series: Record<string, ForecastSeries>;
  ok: boolean;
  error?: string;
}

function holtWinters(values: number[], alpha: number, beta: number, gamma: number, steps: number, seasonLength: number): { fc: number[]; trend: number } {
  const n = values.length;
  if (n < 3) return { fc: Array(steps).fill(values[n - 1] || 0), trend: 0 };
  let level = values[0];
  let trend = values[1] - values[0];
  const seasons: number[] = [];
  for (let i = 0; i < Math.min(n, seasonLength); i++) seasons.push(values[i] - level);
  for (let i = 1; i < n; i++) {
    const lastLevel = level;
    const seasonalIdx = i % seasonLength;
    const seasonal = seasons[seasonalIdx] || 0;
    level = alpha * (values[i] - seasonal) + (1 - alpha) * (lastLevel + trend);
    trend = beta * (level - lastLevel) + (1 - beta) * trend;
    seasons[seasonalIdx] = gamma * (values[i] - level) + (1 - gamma) * (seasons[seasonalIdx] || 0);
  }
  const fc: number[] = [];
  for (let i = 1; i <= steps; i++) {
    const seasonal = seasons[(n + i - 1) % seasonLength] || 0;
    fc.push(level + i * trend + seasonal);
  }
  return { fc, trend };
}

function simpleMovingAverage(values: number[], window: number): number[] {
  if (values.length < window) return [];
  const result: number[] = [];
  for (let i = window - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = 0; j < window; j++) sum += values[i - j];
    result.push(sum / window);
  }
  return result;
}

function exponentialSmoothing(values: number[], alpha: number, steps: number): number[] {
  if (values.length === 0) return Array(steps).fill(0);
  let s = values[0];
  for (let i = 1; i < values.length; i++) s = alpha * values[i] + (1 - alpha) * s;
  return Array(steps).fill(s);
}

function calcVolatility(values: number[]): number {
  if (values.length < 2) return 0;
  const returns: number[] = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] > 0) returns.push((values[i] - values[i - 1]) / values[i - 1]);
  }
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance);
}

function calcTrend(values: number[]): number {
  if (values.length < 2) return 0;
  const n = values.length;
  const indices = Array.from({ length: n }, (_, i) => i);
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) ** 2;
  }
  return den > 0 ? num / den : 0;
}

function calcReliability(history: number[], fc: number[], trend: number, volatility: number): number {
  if (history.length < 3 || volatility === 0) return 0.5;
  const recentReturn = history.length > 5 ? (history[history.length - 1] / history[history.length - 6] - 1) : 0;
  const trendConsistency = Math.abs(trend) / (Math.abs(recentReturn) + 0.01);
  const volPenalty = Math.min(1, volatility * 5);
  return Math.max(0, Math.min(1, 0.5 + trendConsistency * 0.3 - volPenalty * 0.2));
}

function projectWithConfidence(base: number, steps: number, trend: number, volatility: number, z: number): { values: number[]; lower: number[]; upper: number[] } {
  const values: number[] = [];
  const lower: number[] = [];
  const upper: number[] = [];
  let cur = base;
  for (let i = 1; i <= steps; i++) {
    cur = cur * (1 + trend / steps);
    if (cur <= 0) cur = 0.01;
    const ci = z * volatility * Math.sqrt(i / steps) * cur;
    values.push(Math.round(cur * 100) / 100);
    lower.push(Math.max(0, Math.round((cur - ci) * 100) / 100));
    upper.push(Math.round((cur + ci) * 100) / 100);
  }
  return { values, lower, upper };
}

function makeForecastPoints(values: number[], lower: number[], upper: number[], windowMinutes: number): ForecastPoint[] {
  const now = Date.now();
  return values.map((v, i) => ({
    t: new Date(now + (i + 1) * windowMinutes * 60000).toISOString(),
    v, cl: lower[i], cu: upper[i],
  }));
}

function selectMethod(values: number[]): string {
  if (values.length < 5) return "exponential-smoothing";
  const trend = calcTrend(values);
  const vol = calcVolatility(values);
  if (Math.abs(trend) > 0.01 && vol < 0.1) return "holt-winters";
  if (values.length >= 20) return "moving-average";
  return "exponential-smoothing";
}

function computeWindowForecast(values: number[], windowMinutes: number, cfg: import("../config/schema.js").ForecastConfig): { fc: ForecastPoint[]; method: string; trend: number; volatility: number; reliability: number } {
  const alpha = cfg.smoothingAlpha;
  const beta = cfg.trendBeta;
  const gamma = cfg.seasonalGamma;
  const z = cfg.confidenceIntervalZ;
  const steps = 1;
  const volatility = calcVolatility(values);
  const trend = calcTrend(values);
  const method = selectMethod(values);
  let fcValues: number[];
  if (method === "holt-winters" && values.length >= 6) {
    const hw = holtWinters(values, alpha, beta, gamma, steps, Math.min(5, Math.floor(values.length / 2)));
    fcValues = hw.fc;
  } else if (method === "moving-average" && values.length >= 5) {
    const ma = simpleMovingAverage(values, Math.min(5, values.length));
    if (ma.length > 0) fcValues = Array(steps).fill(ma[ma.length - 1]);
    else fcValues = exponentialSmoothing(values, alpha, steps);
  } else {
    fcValues = exponentialSmoothing(values, alpha, steps);
  }
  const lastValue = values[values.length - 1];
  const projected = projectWithConfidence(lastValue, steps, trend, volatility, z);
  const reliability = calcReliability(values, fcValues, trend, volatility);
  return {
    fc: makeForecastPoints(projected.values, projected.lower, projected.upper, windowMinutes),
    method, trend: Math.round(trend * 10000) / 10000,
    volatility: Math.round(volatility * 10000) / 10000,
    reliability: Math.round(reliability * 100) / 100,
  };
}

export function computeForecasts(realm: number): ForecastResult {
  const cfg = loadConfig();
  const fCfg = cfg.forecast;
  if (!fCfg.enableForecasting) return { t: new Date().toISOString(), r: realm, series: {}, ok: true };
  const history = loadIndexHistory(realm, Math.max(30, fCfg.minHistoryPoints));
  const inflationHistory = loadInflationHistory(realm, Math.max(30, fCfg.minHistoryPoints));
  const latestMomentum = loadLatestMomentum(realm);
  const categories = Object.keys(cfg.macroIndexes.categories);
  const series: Record<string, ForecastSeries> = {};

  for (const cat of categories) {
    const catValues = history.map((h) => h.ix[cat]?.v).filter((v): v is number => v !== undefined && v > 0);
    if (catValues.length < fCfg.minHistoryPoints) continue;

    const historyValues = catValues.slice();
    const forecastWindowsMs = fCfg.forecastWindows;
    const fcWindows: ForecastPoint[] = [];

    let lastMethod = "";
    let lastTrend = 0;
    let lastVol = 0;
    let lastReliability = 0;

    for (const wName of forecastWindowsMs) {
      const wMinutes = fCfg.forecastWindowMinutes[wName] || 60;
      const wf = computeWindowForecast(catValues, wMinutes, fCfg);
      fcWindows.push(...wf.fc);
      lastMethod = wf.method;
      lastTrend = wf.trend;
      lastVol = wf.volatility;
      lastReliability = wf.reliability;
    }

    series[cat] = {
      category: cat,
      history: historyValues,
      fc: fcWindows,
      method: lastMethod,
      trend: lastTrend,
      volatility: lastVol,
      reliability: lastReliability,
    };
  }

  const inflationSeries: Record<string, ForecastSeries> = {};
  if (inflationHistory.length >= fCfg.minHistoryPoints) {
    for (const cat of categories) {
      const inflValues = inflationHistory.map((h) => h.in[cat]?.ch).filter((v): v is number => v !== undefined);
      if (inflValues.length < fCfg.minHistoryPoints) continue;
      const wMinutes = 1440;
      const wf = computeWindowForecast(inflValues, wMinutes, fCfg);
      inflationSeries[`inflation-${cat}`] = {
        category: `inflation-${cat}`,
        history: inflValues,
        fc: wf.fc,
        method: wf.method,
        trend: wf.trend,
        volatility: wf.volatility,
        reliability: wf.reliability,
      };
    }
  }

  if (latestMomentum) {
    for (const [cat, m] of Object.entries(latestMomentum)) {
      const momValues = [m.st];
      if (momValues.length < 2) continue;
      const wMinutes = 1440;
      const wf = computeWindowForecast(momValues, wMinutes, fCfg);
      series[`momentum-${cat}`] = {
        category: `momentum-${cat}`,
        history: momValues,
        fc: wf.fc,
        method: wf.method,
        trend: wf.trend,
        volatility: wf.volatility,
        reliability: wf.reliability,
      };
    }
  }

  Object.assign(series, inflationSeries);
  logger.info(`[realm ${realm}] Forecasts computed: ${Object.keys(series).length} series`);
  return { t: new Date().toISOString(), r: realm, series, ok: true };
}

export function computeAllForecasts(): Promise<{ ok: boolean; results: ForecastResult[] }> {
  const cfg = loadConfig();
  const results = cfg.simco.realms.map((r) => {
    try { return computeForecasts(r); }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { t: new Date().toISOString(), r, series: {}, ok: false, error: msg };
    }
  });
  const allOk = results.some((r) => r.ok);
  logger.info(`Forecasts computed: ${results.filter((r) => r.ok).length}/${results.length} realms ok`);
  return Promise.resolve({ ok: allOk, results });
}
