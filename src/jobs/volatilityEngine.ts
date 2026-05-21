import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import { loadIndexHistory, getCategoryNames } from "./intelligenceUtils.js";

export interface CategoryVolatility {
  v5: number;
  v20: number;
  as: number;
  is: number;
  s5: number;
  s20: number;
}

export interface VolatilityResult {
  t: string;
  r: number;
  vol: Record<string, CategoryVolatility>;
  sr: Record<string, number>;
  ok: boolean;
  error?: string;
}

export function computeVolatility(realm: number): VolatilityResult {
  const cfg = loadConfig();
  const shortP = cfg.intelligence.volatilityShortPeriods;
  const mediumP = cfg.intelligence.volatilityMediumPeriods;
  const spikeThreshold = cfg.intelligence.volatilitySpikeThreshold;

  const maxNeeded = Math.max(shortP, mediumP) + 2;
  const history = loadIndexHistory(realm, maxNeeded);

  if (history.length < 3) {
    return {
      t: new Date().toISOString(), r: realm,
      vol: {}, sr: {},
      ok: false, error: `insufficient index history (${history.length} snapshots, need >=3)`,
    };
  }

  const categories = Object.keys(cfg.macroIndexes.categories);
  const vol: Record<string, CategoryVolatility> = {};
  const catNames = getCategoryNames();

  for (const cat of categories) {
    const values = history.map((h) => h.ix[cat]?.v).filter((v): v is number => v !== undefined);
    if (values.length < 3) continue;

    const returns: number[] = [];
    for (let i = 1; i < values.length; i++) {
      if (values[i - 1] > 0) {
        returns.push((values[i] - values[i - 1]) / values[i - 1] * 100);
      }
    }

    if (returns.length < 2) continue;

    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;

    const shortWindow = Math.min(shortP, returns.length);
    const shortReturns = returns.slice(-shortWindow);
    const shortVar = shortReturns.reduce((s, r) => s + (r - mean) * (r - mean), 0) / shortReturns.length;
    const v5 = Math.sqrt(shortVar);

    const midWindow = Math.min(mediumP, returns.length);
    const midReturns = returns.slice(-midWindow);
    const midVar = midReturns.reduce((s, r) => s + (r - mean) * (r - mean), 0) / midReturns.length;
    const v20 = Math.sqrt(midVar);

    const allWindow = Math.min(20, returns.length);
    const allReturns = returns.slice(-allWindow);
    const allMean = allReturns.reduce((s, r) => s + r, 0) / allReturns.length;
    const allVar = allReturns.reduce((s, r) => s + (r - allMean) * (r - allMean), 0) / allReturns.length;
    const allStd = Math.sqrt(allVar);
    const abnormalSpike = allStd > 0 ? (v5 - allStd) / allStd : 0;

    const s5 = Math.round(v5 * 100) / 100;
    const s20 = Math.round(v20 * 100) / 100;
    const as = Math.round(abnormalSpike * 100) / 100;

    const rawIs = Math.min(1, Math.max(0, (s5 + Math.abs(as)) / (2 * spikeThreshold)));
    const is = Math.round(rawIs * 100) / 100;

    vol[cat] = { v5: s5, v20: s20, as, is, s5, s20 };
  }

  const sortedCats = Object.entries(vol).sort((a, b) => {
    const aScore = a[1].v5 + Math.abs(a[1].as);
    const bScore = b[1].v5 + Math.abs(b[1].as);
    return aScore - bScore;
  });

  const sr: Record<string, number> = {};
  sortedCats.forEach(([cat], idx) => { sr[cat] = idx + 1; });

  return {
    t: new Date().toISOString(), r: realm,
    vol, sr,
    ok: true,
  };
}

export function computeAllVolatility(): Promise<{ ok: boolean; results: VolatilityResult[] }> {
  const cfg = loadConfig();
  const results = cfg.simco.realms.map((r) => {
    try {
      return computeVolatility(r);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { t: new Date().toISOString(), r, vol: {}, sr: {}, ok: false, error: msg };
    }
  });
  const allOk = results.every((r) => r.ok);
  logger.info(`Volatility computed: ${results.filter((r) => r.ok).length}/${results.length} realms ok`);
  return Promise.resolve({ ok: allOk, results });
}
