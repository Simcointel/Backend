import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import { loadIndexHistory, type IndexSnapshot } from "./intelligenceUtils.js";

export interface CategoryMomentum {
  st: number;
  mt: number;
  ac: number;
  s5: number;
  m5: number;
  ts: number;
}

export interface MomentumResult {
  t: string;
  r: number;
  momentum: Record<string, CategoryMomentum>;
  stp: number;
  mtp: number;
  ok: boolean;
  error?: string;
}

export function computeMomentum(realm: number): MomentumResult {
  const cfg = loadConfig();
  const stp = cfg.intelligence.shortTermPeriods;
  const mtp = cfg.intelligence.mediumTermPeriods;
  const tsPeriods = cfg.intelligence.momentumTrendStrengthPeriods;

  const maxNeeded = Math.max(stp, mtp, tsPeriods) + 1;
  const history = loadIndexHistory(realm, maxNeeded);

  if (history.length < 2) {
    return {
      t: new Date().toISOString(), r: realm,
      momentum: {}, stp, mtp,
      ok: false, error: `insufficient index history (${history.length} snapshots, need >=2)`,
    };
  }

  const categories = Object.keys(cfg.macroIndexes.categories);
  const momentum: Record<string, CategoryMomentum> = {};

  for (const cat of categories) {
    const values = history.map((h) => h.ix[cat]?.v).filter((v): v is number => v !== undefined);
    if (values.length < 2) continue;

    const latest = values[values.length - 1];

    const shortIdx = Math.max(0, values.length - 1 - stp);
    const shortAgo = values[shortIdx];
    const shortTerm = shortAgo > 0 ? ((latest - shortAgo) / shortAgo) * 100 : 0;

    const medIdx = Math.max(0, values.length - 1 - mtp);
    const medAgo = values[medIdx];
    const mediumTerm = medAgo > 0 ? ((latest - medAgo) / medAgo) * 100 : 0;

    const acceleration = shortTerm - mediumTerm;

    const sma5Window = Math.min(5, values.length);
    const s5 = values.slice(-sma5Window).reduce((s, v) => s + v, 0) / sma5Window;

    const sma20Window = Math.min(20, values.length);
    const m5 = values.slice(-sma20Window).reduce((s, v) => s + v, 0) / sma20Window;

    const tsWindow = Math.min(tsPeriods, values.length);
    const recentValues = values.slice(-tsWindow);
    let upDays = 0;
    for (let i = 1; i < recentValues.length; i++) {
      if (recentValues[i] > recentValues[i - 1]) upDays++;
    }
    const trendStrength = recentValues.length > 1 ? upDays / (recentValues.length - 1) : 0.5;

    momentum[cat] = {
      st: Math.round(shortTerm * 100) / 100,
      mt: Math.round(mediumTerm * 100) / 100,
      ac: Math.round(acceleration * 100) / 100,
      s5: Math.round(s5 * 10000) / 10000,
      m5: Math.round(m5 * 10000) / 10000,
      ts: Math.round(trendStrength * 100) / 100,
    };
  }

  return {
    t: new Date().toISOString(), r: realm,
    momentum, stp, mtp,
    ok: true,
  };
}

export function computeAllMomentum(): Promise<{ ok: boolean; results: MomentumResult[] }> {
  const cfg = loadConfig();
  const results = cfg.simco.realms.map((r) => {
    try {
      return computeMomentum(r);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        t: new Date().toISOString(), r,
        momentum: {}, stp: 0, mtp: 0,
        ok: false, error: msg,
      } as MomentumResult;
    }
  });
  const allOk = results.every((r) => r.ok);
  logger.info(`Momentum computed: ${results.filter((r) => r.ok).length}/${results.length} realms ok`);
  return Promise.resolve({ ok: allOk, results });
}
