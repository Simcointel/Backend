import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import { loadLatestMomentum, loadLatestStress, loadLatestRegime, getCategories, makeEventId } from "./relationalUtils.js";
import { loadInflationHistory } from "./intelligenceUtils.js";

export interface DivergenceEvent {
  id: string;
  ty: string;
  se: string;
  de: string;
  sc: string[];
  st: number;
  dr: string;
}

export interface DivergenceResult {
  t: string;
  r: number;
  di: DivergenceEvent[];
  su: { to: number; cr: number; wa: number; in: number };
  ok: boolean;
  error?: string;
}

export function detectDivergences(realm: number): DivergenceResult {
  const cfg = loadConfig();
  const momThreshold = cfg.relational.divergenceMomentumThreshold;
  const infThreshold = cfg.relational.divergenceInflationThreshold;
  const categories = getCategories();
  const events: DivergenceEvent[] = [];

  const momentum = loadLatestMomentum(realm);
  const stress = loadLatestStress(realm);
  const regime = loadLatestRegime(realm);
  const inflationReports = loadInflationHistory(realm, 5);

  if (momentum && Object.keys(momentum).length >= 2) {
    const sorted = Object.entries(momentum)
      .map(([c, m]) => ({ c, score: m.st * 0.6 + m.mt * 0.4 }))
      .sort((a, b) => b.score - a.score);

    const top = sorted[0];
    const bottom = sorted[sorted.length - 1];
    const gap = top.score - bottom.score;

    if (gap >= momThreshold) {
      const maxGap = Math.max(...sorted.map((s) => Math.abs(s.score)));
      const strength = Math.round((gap / (maxGap || 1)) * 100) / 100;
      events.push({
        id: makeEventId(), ty: "sector-divergence",
        se: strength > 0.7 ? "warning" : "info",
        de: `${top.c} (${top.score.toFixed(1)}) outperforming ${bottom.c} (${bottom.score.toFixed(1)}) by ${gap.toFixed(1)}pts`,
        sc: [top.c, bottom.c], st: strength, dr: `${top.c}-up-${bottom.c}-down`,
      });
    }
  }

  if (regime) {
    const cvGrowth = regime.rf.cvGrowth;
    const acGrowth = regime.rf.acGrowth;
    if (cvGrowth > 1 && acGrowth < -2) {
      events.push({
        id: makeEventId(), ty: "growth-employment-divergence",
        se: "info",
        de: `CV growing (${cvGrowth}%) but companies declining (${acGrowth}%)`,
        sc: ["realm"], st: Math.round(Math.abs(cvGrowth - acGrowth) * 10) / 10, dr: "cv-up-ac-down",
      });
    }
  }

  if (inflationReports.length > 0 && momentum) {
    const latest = inflationReports[inflationReports.length - 1];
    const infCats = Object.entries(latest.in).filter(([, v]) => !isNaN(v.ch));
    if (infCats.length >= 2) {
      const sortedInf = infCats.sort((a, b) => b[1].ch - a[1].ch);
      const topInf = sortedInf[0];
      const botInf = sortedInf[sortedInf.length - 1];
      const infGap = topInf[1].ch - botInf[1].ch;
      if (infGap >= infThreshold) {
        events.push({
          id: makeEventId(), ty: "inflation-divergence",
          se: infGap > infThreshold * 2 ? "warning" : "info",
          de: `${topInf[0]} inflating ${topInf[1].ch}% while ${botInf[0]} at ${botInf[1].ch}%`,
          sc: [topInf[0], botInf[0]], st: Math.round(infGap * 10) / 10, dr: `${topInf[0]}-high-${botInf[0]}-low`,
        });
      }
    }
  }

  if (stress && stress.rs.af > 0) {
    const stressedCats = Object.entries(stress.stress)
      .filter(([, s]) => s.flags.length > 0)
      .map(([c]) => c);

    if (stressedCats.length > 0 && stressedCats.length < categories.length / 2) {
      const unstressedCats = categories.filter((c) => !stressedCats.includes(c));
      events.push({
        id: makeEventId(), ty: "stress-divergence",
        se: "warning",
        de: `${stressedCats.length} sectors stressed (${stressedCats.join(", ")}) while ${unstressedCats.length} stable`,
        sc: stressedCats, st: Math.round((stressedCats.length / categories.length) * 100) / 100,
        dr: "stressed-vs-stable",
      });
    }
  }

  const counts = { to: events.length, cr: 0, wa: 0, in: 0 };
  for (const e of events) { if (e.se === "critical") counts.cr++; else if (e.se === "warning") counts.wa++; else counts.in++; }

  return { t: new Date().toISOString(), r: realm, di: events, su: counts, ok: true };
}

export function detectAllDivergences(): Promise<{ ok: boolean; results: DivergenceResult[] }> {
  const cfg = loadConfig();
  const results = cfg.simco.realms.map((r) => {
    try { return detectDivergences(r); }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { t: new Date().toISOString(), r, di: [], su: { to: 0, cr: 0, wa: 0, in: 0 }, ok: false, error: msg };
    }
  });
  const allOk = results.some((r) => r.ok);
  logger.info(`Divergences detected: ${results.reduce((s, r) => s + r.di.length, 0)} events across ${results.length} realms`);
  return Promise.resolve({ ok: allOk, results });
}
