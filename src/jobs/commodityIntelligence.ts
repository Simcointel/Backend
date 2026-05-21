import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import { getCategoryNames } from "./intelligenceUtils.js";
import { computeMomentum, type MomentumResult } from "./momentumEngine.js";
import { computeVolatility, type VolatilityResult } from "./volatilityEngine.js";

export interface CommodityRanking {
  c: string;
  cn: string;
  m: number;
  t: "up" | "down" | "flat";
}

export interface LeadersResult {
  t: string;
  r: number;
  st: CommodityRanking[];
  wk: CommodityRanking[];
  fr: CommodityRanking[];
  mu: CommodityRanking[];
  lw: CommodityRanking[];
  ll: CommodityRanking[];
  ok: boolean;
  error?: string;
}

export interface SectorView {
  momentum: { st: number; mt: number };
  volatility: { v5: number; v20: number };
  flags: string[];
  outlook: string;
}

export interface SectorsResult {
  t: string;
  r: number;
  sectors: Record<string, SectorView>;
  ok: boolean;
  error?: string;
}

function classifyTrend(momentum: number): "up" | "down" | "flat" {
  if (momentum > 1) return "up";
  if (momentum < -1) return "down";
  return "flat";
}

export function computeLeaders(realm: number, momentumResult?: MomentumResult, volatilityResult?: VolatilityResult): LeadersResult {
  const cfg = loadConfig();
  const momentum = momentumResult || computeMomentum(realm);
  const volatility = volatilityResult || computeVolatility(realm);
  const catNames = getCategoryNames();

  const catEntries = Object.entries(momentum.momentum).map(([c, m]) => ({
    c, cn: catNames[c] || c,
    st: m.st,
    mt: m.mt,
    combinedScore: m.st * 0.6 + m.mt * 0.4,
    volScore: volatility.vol[c]?.v5 || 0,
    longScore: m.mt,
  }));

  const sortedByCombined = [...catEntries].sort((a, b) => b.combinedScore - a.combinedScore);
  const sortedByVol = [...catEntries].sort((a, b) => b.volScore - a.volScore);
  const sortedByLong = [...catEntries].sort((a, b) => b.longScore - a.longScore);
  const sortedByVolAsc = [...catEntries].sort((a, b) => a.volScore - b.volScore);

  const toRanking = (e: typeof catEntries[0]): CommodityRanking => ({
    c: e.c, cn: e.cn,
    m: Math.round(e.combinedScore * 100) / 100,
    t: classifyTrend(e.combinedScore),
  });

  return {
    t: new Date().toISOString(), r: realm,
    st: sortedByCombined.slice(0, 3).map(toRanking),
    wk: sortedByCombined.slice(-3).reverse().map(toRanking),
    fr: sortedByCombined.slice(0, 3).map(toRanking),
    mu: sortedByVol.slice(0, 3).map((e) => ({ c: e.c, cn: e.cn, m: Math.round(e.volScore * 100) / 100, t: classifyTrend(e.volScore) })),
    lw: sortedByLong.slice(0, 3).map(toRanking),
    ll: sortedByLong.slice(-3).reverse().map(toRanking),
    ok: true,
  };
}

export function computeSectors(realm: number, momentumResult?: MomentumResult, volatilityResult?: VolatilityResult): SectorsResult {
  const cfg = loadConfig();
  const momentum = momentumResult || computeMomentum(realm);
  const volatility = volatilityResult || computeVolatility(realm);
  const catNames = getCategoryNames();

  const sectors: Record<string, SectorView> = {};
  for (const [cat, m] of Object.entries(momentum.momentum)) {
    const v = volatility.vol[cat];
    const flags: string[] = [];

    if (m.ts >= 0.7) flags.push("strong-trend");
    if (m.ts <= 0.3) flags.push("weak-trend");
    if (m.ac > 2) flags.push("accelerating");
    if (m.ac < -2) flags.push("decelerating");
    if (v && v.v5 > 3) flags.push("high-volatility");
    if (v && v.v5 < 0.5) flags.push("stable");

    let outlook = "neutral";
    const combinedScore = m.st * 0.5 + m.mt * 0.3 + (v ? -v.v5 * 0.2 : 0);
    if (combinedScore > 2) outlook = "positive";
    else if (combinedScore < -2) outlook = "negative";

    sectors[cat] = {
      momentum: { st: m.st, mt: m.mt },
      volatility: v ? { v5: v.v5, v20: v.v20 } : { v5: 0, v20: 0 },
      flags,
      outlook,
    };
  }

  return {
    t: new Date().toISOString(), r: realm,
    sectors,
    ok: true,
  };
}

export function computeAllLeaders(): Promise<{ ok: boolean; results: LeadersResult[] }> {
  const cfg = loadConfig();
  const results = cfg.simco.realms.map((r) => {
    try {
      const momentum = computeMomentum(r);
      const volatility = computeVolatility(r);
      return computeLeaders(r, momentum, volatility);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { t: new Date().toISOString(), r, st: [], wk: [], fr: [], mu: [], lw: [], ll: [], ok: false, error: msg };
    }
  });
  const allOk = results.every((r) => r.ok);
  logger.info(`Leaders computed: ${results.filter((r) => r.ok).length}/${results.length} realms ok`);
  return Promise.resolve({ ok: allOk, results });
}

export function computeAllSectors(): Promise<{ ok: boolean; results: SectorsResult[] }> {
  const cfg = loadConfig();
  const results = cfg.simco.realms.map((r) => {
    try {
      const momentum = computeMomentum(r);
      const volatility = computeVolatility(r);
      return computeSectors(r, momentum, volatility);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { t: new Date().toISOString(), r, sectors: {}, ok: false, error: msg };
    }
  });
  const allOk = results.every((r) => r.ok);
  logger.info(`Sectors computed: ${results.filter((r) => r.ok).length}/${results.length} realms ok`);
  return Promise.resolve({ ok: allOk, results });
}
