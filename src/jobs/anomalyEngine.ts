import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import { loadCategoryIndexHistory, loadLatestVolatility, loadLatestRegime, getCategories, makeEventId, severityFromZScore } from "./relationalUtils.js";
import { loadInflationHistory } from "./intelligenceUtils.js";

export interface AnomalyEvent {
  id: string;
  ty: string;
  se: string;
  ca: string;
  ti: string;
  de: string;
  zs: number;
  vl: number;
  mn: number;
  sd: number;
  ts: string;
}

export interface AnomalyResult {
  t: string;
  r: number;
  an: AnomalyEvent[];
  su: { to: number; cr: number; wa: number; in: number };
  ok: boolean;
  error?: string;
}

export function detectAnomalies(realm: number): AnomalyResult {
  const cfg = loadConfig();
  const zThreshold = cfg.relational.anomalyZScoreThreshold;
  const zCritical = cfg.relational.anomalyCriticalZScoreThreshold;
  const infThreshold = cfg.relational.anomalyInflationThreshold;
  const categories = getCategories();
  const anomalies: AnomalyEvent[] = [];

  const history = loadCategoryIndexHistory(realm, 30);
  const volatility = loadLatestVolatility(realm);
  const regime = loadLatestRegime(realm);
  const inflationReports = loadInflationHistory(realm, 10);

  if (history.length >= 5) {
    for (const cat of categories) {
      const values = history.map((h) => h.values[cat]).filter((v): v is number => v !== undefined && v > 0);
      if (values.length < 5) continue;

      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
      const std = Math.sqrt(variance);
      const latest = values[values.length - 1];

      if (std > 0) {
        const zs = Math.round(((latest - mean) / std) * 100) / 100;
        if (Math.abs(zs) >= zThreshold) {
          const sev = severityFromZScore(zs, zCritical, zThreshold);
          anomalies.push({
            id: makeEventId(), ty: zs > 0 ? "price-spike" : "price-crash", se: sev, ca: cat,
            ti: `${zs > 0 ? "Spike" : "Crash"} in ${cat}`,
            de: `${cat} z-score: ${zs} (value: ${Math.round(latest)}, mean: ${Math.round(mean)})`,
            zs, vl: Math.round(latest * 100) / 100, mn: Math.round(mean * 100) / 100, sd: Math.round(std * 100) / 100,
            ts: new Date().toISOString(),
          });
        }
      }
    }
  }

  if (volatility) {
    for (const [cat, v] of Object.entries(volatility)) {
      if (v.as >= zThreshold) {
        const sev = severityFromZScore(v.as, zCritical, zThreshold);
        anomalies.push({
          id: makeEventId(), ty: "volatility-explosion", se: sev, ca: cat,
          ti: `Volatility spike in ${cat}`,
          de: `${cat} abnormal volatility: ${v.as}σ (5d: ${v.v5}%, 20d: ${v.v20}%)`,
          zs: Math.round(v.as * 100) / 100, vl: v.v5, mn: v.v20, sd: 0,
          ts: new Date().toISOString(),
        });
      }
    }
  }

  if (regime && regime.rf.phase === "recession") {
    anomalies.push({
      id: makeEventId(), ty: "recession-active", se: "info", ca: "realm",
      ti: "Recession phase active",
      de: `Realm ${realm} in recession. CV growth: ${regime.rf.cvGrowth}%`,
      zs: 0, vl: regime.rf.cvGrowth, mn: 0, sd: 0,
      ts: new Date().toISOString(),
    });
  }

  if (inflationReports.length > 0) {
    const latest = inflationReports[inflationReports.length - 1];
    for (const [cat, inf] of Object.entries(latest.in)) {
      if (inf.ch >= infThreshold) {
        anomalies.push({
          id: makeEventId(), ty: "inflation-anomaly", se: "warning", ca: cat,
          ti: `High inflation in ${cat}`,
          de: `${cat} inflation: ${inf.ch}% (current: ${inf.cv}, previous: ${inf.pv})`,
          zs: Math.round(inf.ch * 100) / 100, vl: inf.cv, mn: inf.pv, sd: 0,
          ts: new Date().toISOString(),
        });
      }
    }
  }

  const counts = { to: anomalies.length, cr: 0, wa: 0, in: 0 };
  for (const a of anomalies) { if (a.se === "critical") counts.cr++; else if (a.se === "warning") counts.wa++; else counts.in++; }

  return { t: new Date().toISOString(), r: realm, an: anomalies, su: counts, ok: true };
}

export function detectAllAnomalies(): Promise<{ ok: boolean; results: AnomalyResult[] }> {
  const cfg = loadConfig();
  const results = cfg.simco.realms.map((r) => {
    try { return detectAnomalies(r); }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { t: new Date().toISOString(), r, an: [], su: { to: 0, cr: 0, wa: 0, in: 0 }, ok: false, error: msg };
    }
  });
  const allOk = results.some((r) => r.ok);
  logger.info(`Anomalies detected: ${results.reduce((s, r) => s + r.an.length, 0)} events across ${results.length} realms`);
  return Promise.resolve({ ok: allOk, results });
}
