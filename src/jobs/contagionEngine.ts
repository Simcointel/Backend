import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import { loadLatestMomentum, loadLatestVolatility, loadLatestStress, loadLatestRegime, getCategories, loadCategoryIndexHistory, makeEventId } from "./relationalUtils.js";
import { loadInflationHistory } from "./intelligenceUtils.js";

export interface ContagionSignal {
  id: string;
  ty: string;
  so: string;
  af: string[];
  st: number;
  de: string;
}

export interface ContagionResult {
  t: string;
  r: number;
  co: ContagionSignal[];
  ci: number;
  ok: boolean;
  error?: string;
}

export function detectContagion(realm: number): ContagionResult {
  const cfg = loadConfig();
  const infSpreadThreshold = cfg.relational.contagionInflationSpreadThreshold;
  const categories = getCategories();
  const signals: ContagionSignal[] = [];

  const momentum = loadLatestMomentum(realm);
  const volatility = loadLatestVolatility(realm);
  const stress = loadLatestStress(realm);
  const regime = loadLatestRegime(realm);
  const inflationReports = loadInflationHistory(realm, 5);
  const indexHistory = loadCategoryIndexHistory(realm, 10);

  if (inflationReports.length >= 2) {
    const latest = inflationReports[inflationReports.length - 1];
    const prev = inflationReports.length >= 2 ? inflationReports[inflationReports.length - 2] : null;

    if (prev) {
      const spreadPairs: Array<{ src: string; affected: string[]; ch: number }> = [];

      for (const [cat, inf] of Object.entries(latest.in)) {
        if (inf.ch >= infSpreadThreshold) {
          const prevVal = prev.in[cat];
          if (prevVal && prevVal.ch < infSpreadThreshold && inf.ch >= infSpreadThreshold) {
            const chains = ["industrial-goods", "consumer-goods", "construction", "aerospace"].filter(
              (c) => c !== cat && latest.in[c] && latest.in[c].ch > infSpreadThreshold * 0.5,
            );
            if (chains.length > 0) {
              spreadPairs.push({ src: cat, affected: chains, ch: inf.ch });
            }
          }
        }
      }

      for (const sp of spreadPairs) {
        signals.push({
          id: makeEventId(), ty: "inflation-spread", so: sp.src, af: sp.affected,
          st: Math.round(Math.min(1, sp.ch / (infSpreadThreshold * 3)) * 100) / 100,
          de: `${sp.src} inflation (${sp.ch}%) spreading to ${sp.affected.join(", ")}`,
        });
      }
    }
  }

  if (stress && stress.rs.af >= 2) {
    const stressedWithFlags = Object.entries(stress.stress)
      .filter(([, s]) => s.flags.length > 0)
      .sort((a, b) => b[1].flags.length - a[1].flags.length);

    if (stressedWithFlags.length >= 2) {
      const primary = stressedWithFlags[0];
      const affected = stressedWithFlags.slice(1).map(([c]) => c);
      signals.push({
        id: makeEventId(), ty: "cascading-instability", so: primary[0], af: affected,
        st: Math.round((stressedWithFlags.length / categories.length) * 100) / 100,
        de: `Instability cascading from ${primary[0]} to ${affected.join(", ")} (${stressedWithFlags.length}/${categories.length} sectors stressed)`,
      });
    }
  }

  if (volatility && stress) {
    const highVolCats = Object.entries(volatility)
      .filter(([, v]) => v.v5 > 2 && v.as > 1)
      .map(([c]) => c);

    const stressedCats = Object.entries(stress.stress)
      .filter(([, s]) => s.flags.length > 0)
      .map(([c]) => c);

    const syncCats = highVolCats.filter((c) => stressedCats.includes(c));
    if (syncCats.length >= 3) {
      signals.push({
        id: makeEventId(), ty: "correlated-stress-volatility", so: syncCats[0], af: syncCats.slice(1),
        st: Math.round((syncCats.length / categories.length) * 100) / 100,
        de: `${syncCats.length} sectors show correlated stress and high volatility: ${syncCats.join(", ")}`,
      });
    }
  }

  if (regime && regime.cr === "contraction" && stress && stress.rs.os > 0.3) {
    signals.push({
      id: makeEventId(), ty: "systemic-stress",
      so: "realm", af: categories,
      st: stress.rs.os,
      de: `Systemic stress during contraction: ${stress.rs.af}/${stress.rs.tf} stress flags active`,
    });
  }

  const contagionIndex = signals.length > 0
    ? Math.round(Math.min(1, signals.reduce((s, sig) => s + sig.st, 0) / Math.max(1, signals.length)) * 100) / 100
    : 0;

  return {
    t: new Date().toISOString(), r: realm,
    co: signals, ci: contagionIndex,
    ok: true,
  };
}

export function detectAllContagion(): Promise<{ ok: boolean; results: ContagionResult[] }> {
  const cfg = loadConfig();
  const results = cfg.simco.realms.map((r) => {
    try { return detectContagion(r); }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { t: new Date().toISOString(), r, co: [], ci: 0, ok: false, error: msg };
    }
  });
  const allOk = results.some((r) => r.ok);
  logger.info(`Contagion detected: ${results.reduce((s, r) => s + r.co.length, 0)} signals across ${results.length} realms`);
  return Promise.resolve({ ok: allOk, results });
}
