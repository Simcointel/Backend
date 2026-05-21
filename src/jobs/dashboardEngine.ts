import { writeFileSync, readFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import { resolve, join } from "path";
import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import { getDataRoot, getCategoryNames } from "./intelligenceUtils.js";
import { loadLatestMomentum, loadLatestVolatility, loadLatestStress, loadLatestRegime } from "./relationalUtils.js";
import { loadEvents } from "./alertEngine.js";

export interface DashboardScores {
  eh: number;  // economic health 0-100
  ms: number;  // market sentiment 0-100
  st: number;  // stability 0-100
  ip: number;  // inflation pressure 0-100
  sr: number;  // systemic risk 0-100
}

export interface DashboardSummary {
  t: string;
  r: number;
  scores: DashboardScores;
  regime: { label: string; confidence: number };
  inflation: { avg: number; max: number; count: number };
  momentum: { avg: number; accelerating: number; decelerating: number };
  volatility: { avg: number; highCount: number };
  stress: { overall: number; activeFlags: number };
  anomalies: { total: number; critical: number; warning: number };
  alerts: { total: number; critical: number; warning: number };
  leaders: { top: string; bottom: string };
  ok: boolean;
  error?: string;
}

function regimeToScore(regime: string): number {
  const map: Record<string, number> = { contraction: 20, stagnation: 40, recovery: 55, expansion: 75, boom: 85, overheating: 60 };
  return map[regime] ?? 50;
}

function clamp100(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v * 10) / 10));
}

function normalizeCV(cvGrowth: number): number {
  return clamp100(50 + cvGrowth * 5);
}

function normalizeAC(acGrowth: number): number {
  return clamp100(50 + acGrowth * 5);
}

export function computeDashboardSummary(realm: number): DashboardSummary {
  const cfg = loadConfig();
  const weights = cfg.dashboard.scoreWeights;

  const regime = loadLatestRegime(realm);
  const momentum = loadLatestMomentum(realm);
  const volatility = loadLatestVolatility(realm);
  const stress = loadLatestStress(realm);

  const catNames = getCategoryNames();

  function readLatestAnomalies(): { su?: { to: number; cr: number; wa: number } } | null {
    const dir = resolve(getDataRoot(), "aggregates", "anomalies", `realm-${realm}`);
    if (!existsSync(dir)) return null;
    const files = readdirSync(dir).filter((f) => f.startsWith("anomaly-") && f.endsWith(".json")).sort().reverse();
    if (files.length === 0) return null;
    try { return JSON.parse(readFileSync(join(dir, files[0]), "utf-8")) as { su?: { to: number; cr: number; wa: number } }; }
    catch { return null; }
  }

  function readLatestContagion(): { ci?: number } | null {
    const dir = resolve(getDataRoot(), "aggregates", "contagion", `realm-${realm}`);
    if (!existsSync(dir)) return null;
    const files = readdirSync(dir).filter((f) => f.startsWith("contagion-") && f.endsWith(".json")).sort().reverse();
    if (files.length === 0) return null;
    try { return JSON.parse(readFileSync(join(dir, files[0]), "utf-8")) as { ci?: number }; }
    catch { return null; }
  }

  const anomaliesLatest = readLatestAnomalies();
  const alerts = loadEvents(realm, 50);

  const rScore = regimeToScore(regime?.cr || "stagnation");
  const cvGrowth = regime?.rf.cvGrowth ?? 0;
  const acGrowth = regime?.rf.acGrowth ?? 0;
  const eh = clamp100(
    normalizeCV(cvGrowth) * weights.economicHealth.cvGrowth +
    normalizeAC(acGrowth) * weights.economicHealth.acGrowth +
    rScore * weights.economicHealth.regimeScore,
  );

  let avgMomentum = 0;
  let accelerating = 0;
  let decelerating = 0;
  let momCount = 0;
  if (momentum) {
    const entries = Object.values(momentum);
    avgMomentum = entries.reduce((s, m) => s + m.st, 0) / entries.length;
    accelerating = entries.filter((m) => m.ac > 0).length;
    decelerating = entries.filter((m) => m.ac < 0).length;
    momCount = entries.length;
  }

  const momScore = clamp100(50 + avgMomentum * 2);
  let volScore = 50;
  let highVolCount = 0;
  if (volatility) {
    const entries = Object.values(volatility);
    const avgVol = entries.reduce((s, v) => s + v.v5, 0) / entries.length;
    highVolCount = entries.filter((v) => v.v5 > 2).length;
    volScore = clamp100(100 - avgVol * 10);
  }

  const ms = clamp100(
    momScore * weights.marketSentiment.momentum +
    volScore * weights.marketSentiment.volatility +
    (regime?.rf.avgVolatility !== undefined ? clamp100(100 - Math.abs(regime.rf.avgVolatility) * 20) : 50) * weights.marketSentiment.trendStrength,
  );

  let stressOverall = 0;
  let activeFlagCount = 0;
  if (stress) {
    stressOverall = stress.rs.os;
    activeFlagCount = stress.rs.af;
  }
  const stressScore = clamp100(100 - stressOverall * 100);
  const st = clamp100(volScore * weights.stability.volatilityPenalty + stressScore * weights.stability.stressPenalty);

  let avgInflation = 0;
  if (regime) {
    avgInflation = Math.abs(regime.rf.avgInflation);
  }
  const ip = clamp100(avgInflation * 15);

  const anomalyCounts = { total: anomaliesLatest?.su?.to ?? 0, critical: anomaliesLatest?.su?.cr ?? 0, warning: anomaliesLatest?.su?.wa ?? 0 };
  const alertCounts = { total: alerts.length, critical: alerts.filter((a) => a.se === "critical").length, warning: alerts.filter((a) => a.se === "warning").length };

  const contagionFile = readLatestContagion();
  const contagionIndex = contagionFile?.ci ?? 0;

  const regimeRisk = (() => { const r2: Record<string, number> = { contraction: 80, overheating: 70, stagnation: 40, recovery: 30, expansion: 20, boom: 25 }; return r2[regime?.cr || ""] ?? 50; })();

  const sr = clamp100(
    contagionIndex * 100 * weights.systemicRisk.contagionIndex +
    stressOverall * 100 * weights.systemicRisk.stressLevel +
    clamp100(anomalyCounts.total * 20) * weights.systemicRisk.anomalyCount +
    regimeRisk * weights.systemicRisk.regimeRisk,
  );

  const leaderCats = momentum ? Object.entries(momentum).sort((a, b) => (b[1].st * 0.6 + b[1].mt * 0.4) - (a[1].st * 0.6 + a[1].mt * 0.4)) : [];

  return {
    t: new Date().toISOString(), r: realm,
    scores: { eh, ms, st, ip, sr },
    regime: { label: regime?.cr || "unknown", confidence: regime?.rc ?? 0 },
    inflation: { avg: Math.round(avgInflation * 100) / 100, max: 0, count: 0 },
    momentum: { avg: Math.round(avgMomentum * 100) / 100, accelerating, decelerating },
    volatility: { avg: volatility ? Math.round(Object.values(volatility).reduce((s, v) => s + v.v5, 0) / Object.values(volatility).length * 100) / 100 : 0, highCount: highVolCount },
    stress: { overall: stressOverall, activeFlags: activeFlagCount },
    anomalies: anomalyCounts,
    alerts: alertCounts,
    leaders: { top: leaderCats[0]?.[0] || "none", bottom: leaderCats[leaderCats.length - 1]?.[0] || "none" },
    ok: true,
  };
}

export function storeDashboardSummary(realm: number, summary: DashboardSummary): void {
  const dir = resolve(getDataRoot(), "aggregates", "dashboard", `realm-${realm}`);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/:/g, "-");
  writeFileSync(resolve(dir, `summary-${ts}.json`), JSON.stringify(summary) + "\n", "utf-8");
}

export function computeAllDashboardSummaries(): Promise<{ ok: boolean; results: DashboardSummary[] }> {
  const cfg = loadConfig();
  const results = cfg.simco.realms.map((r) => {
    try {
      const summary = computeDashboardSummary(r);
      storeDashboardSummary(r, summary);
      return summary;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { t: new Date().toISOString(), r, scores: { eh: 0, ms: 0, st: 0, ip: 0, sr: 0 }, regime: { label: "unknown", confidence: 0 }, inflation: { avg: 0, max: 0, count: 0 }, momentum: { avg: 0, accelerating: 0, decelerating: 0 }, volatility: { avg: 0, highCount: 0 }, stress: { overall: 0, activeFlags: 0 }, anomalies: { total: 0, critical: 0, warning: 0 }, alerts: { total: 0, critical: 0, warning: 0 }, leaders: { top: "none", bottom: "none" }, ok: false, error: msg };
    }
  });
  const allOk = results.every((r) => r.ok);
  logger.info(`Dashboard summaries computed: ${results.filter((r) => r.ok).length}/${results.length} realms ok`);
  return Promise.resolve({ ok: allOk, results });
}
