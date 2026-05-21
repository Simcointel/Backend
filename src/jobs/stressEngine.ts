import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import { loadIndexHistory, loadInflationHistory, loadRealmHistory, getCategoryNames } from "./intelligenceUtils.js";
import { computeMomentum, type MomentumResult } from "./momentumEngine.js";
import { computeVolatility, type VolatilityResult } from "./volatilityEngine.js";

export interface CategoryStress {
  ri: boolean;
  cp: boolean;
  scp: number;
  oh: boolean;
  cs: boolean;
  flags: string[];
}

export interface RealmStressSummary {
  os: number;
  af: number;
  tf: number;
}

export interface StressResult {
  t: string;
  r: number;
  stress: Record<string, CategoryStress>;
  rs: RealmStressSummary;
  ok: boolean;
  error?: string;
}

export function computeStress(realm: number, momentumResult?: MomentumResult, volatilityResult?: VolatilityResult): StressResult {
  const cfg = loadConfig();
  const rapidInfThreshold = cfg.intelligence.rapidInflationThreshold;
  const collapseThreshold = cfg.intelligence.collapseThreshold;
  const overheatThreshold = cfg.intelligence.overheatingThreshold;

  const categories = Object.keys(cfg.macroIndexes.categories);
  const catNames = getCategoryNames();

  const inflationReports = loadInflationHistory(realm, 3);
  const latestInflation = inflationReports.length > 0
    ? inflationReports[inflationReports.length - 1].in
    : {};

  const indexHistory = loadIndexHistory(realm, Math.max(cfg.intelligence.mediumTermPeriods, 5) + 1);
  const momentum = momentumResult || computeMomentum(realm);
  const volatility = volatilityResult || computeVolatility(realm);

  const realmHistory = loadRealmHistory(realm);
  const recentHistory = realmHistory.slice(-30);

  let cvTrend = 0;
  let acTrend = 0;
  if (recentHistory.length >= 7) {
    const recent = recentHistory[recentHistory.length - 1];
    const past = recentHistory[recentHistory.length - 7];
    cvTrend = past.cv > 0 ? ((recent.cv - past.cv) / past.cv) * 100 : 0;
    acTrend = past.ac > 0 ? ((recent.ac - past.ac) / past.ac) * 100 : 0;
  }

  const stress: Record<string, CategoryStress> = {};
  let activeFlags = 0;
  let totalChecks = 0;

  for (const cat of categories) {
    const flags: string[] = [];

    const inf = latestInflation[cat];
    const rapidInflation = inf ? inf.ch >= rapidInfThreshold : false;
    if (rapidInflation) flags.push("rapid-inflation");

    const catMom = momentum.momentum[cat];
    const collapsing = catMom ? catMom.mt <= collapseThreshold : false;
    if (collapsing) flags.push("collapsing-prices");

    let supplyChainPressure = 0;
    if (inf && latestInflation["raw-materials"] && latestInflation["consumer-goods"]) {
      const rawInf = latestInflation["raw-materials"].ch;
      const conInf = latestInflation["consumer-goods"].ch;
      supplyChainPressure = Math.round((rawInf - conInf) * 100) / 100;
      if (supplyChainPressure > 5) flags.push("supply-chain-pressure");
    }

    let overheating = false;
    if (catMom) {
      const sma20 = catMom.m5;
      const idxHistory = indexHistory.map((h) => h.ix[cat]?.v).filter((v): v is number => v !== undefined);
      const latestVal = idxHistory.length > 0 ? idxHistory[idxHistory.length - 1] : 0;
      if (sma20 > 0 && latestVal > 0) {
        overheating = latestVal / sma20 >= overheatThreshold;
      }
    }
    if (overheating) flags.push("overheating");

    const contractionSignal = cvTrend < -2 && acTrend < -1;
    if (contractionSignal) flags.push("contraction");

    totalChecks += 5;
    activeFlags += flags.length;

    stress[cat] = {
      ri: rapidInflation, cp: collapsing,
      scp: supplyChainPressure, oh: overheating, cs: contractionSignal,
      flags,
    };
  }

  const overallScore = totalChecks > 0 ? Math.round((activeFlags / totalChecks) * 100) / 100 : 0;

  return {
    t: new Date().toISOString(), r: realm,
    stress,
    rs: { os: overallScore, af: activeFlags, tf: totalChecks },
    ok: true,
  };
}

export function computeAllStress(): Promise<{ ok: boolean; results: StressResult[] }> {
  const cfg = loadConfig();
  const results = cfg.simco.realms.map((r) => {
    try {
      const momentum = computeMomentum(r);
      const volatility = computeVolatility(r);
      return computeStress(r, momentum, volatility);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { t: new Date().toISOString(), r, stress: {}, rs: { os: 0, af: 0, tf: 0 }, ok: false, error: msg };
    }
  });
  const allOk = results.every((r) => r.ok);
  logger.info(`Stress computed: ${results.filter((r) => r.ok).length}/${results.length} realms ok`);
  return Promise.resolve({ ok: allOk, results });
}
