import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, join } from "path";
import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import { loadCategoryIndexHistory, getCategories, getDataRoot } from "./relationalUtils.js";

interface CorrPair {
  r: number;
  s: string;
  n: number;
}

export interface CorrelationResult {
  t: string;
  r: number;
  w: number;
  m: Record<string, Record<string, CorrPair>>;
  tp: Array<{ a: string; b: string; r: number; s: string; n: number }>;
  sh: Record<string, { cu: number; pr: number; de: number }>;
  ok: boolean;
  error?: string;
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = ys.reduce((a, b) => a + b, 0);
  const sxx = xs.reduce((a, b) => a + b * b, 0);
  const syy = ys.reduce((a, b) => a + b * b, 0);
  const sxy = xs.reduce((a, b, i) => a + b * ys[i], 0);
  const num = n * sxy - sx * sy;
  const den = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
  if (den === 0) return 0;
  const r = num / den;
  return Math.max(-1, Math.min(1, r));
}

function strength(r: number): string {
  const a = Math.abs(r);
  if (a >= 0.7) return "strong";
  if (a >= 0.5) return "moderate";
  return "weak";
}

interface PrevCorr {
  m: Record<string, Record<string, CorrPair>>;
}

function loadPrevious(realm: number): PrevCorr | null {
  const dir = resolve(getDataRoot(), "aggregates", "correlations", `realm-${realm}`);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.startsWith("correlation-") && f.endsWith(".json")).sort().reverse();
  if (files.length === 0) return null;
  try { return JSON.parse(readFileSync(join(dir, files[0]), "utf-8")) as PrevCorr; }
  catch { return null; }
}

export function computeCorrelations(realm: number): CorrelationResult {
  const cfg = loadConfig();
  const window = cfg.relational.correlationWindow;
  const minPoints = cfg.relational.correlationMinPoints;
  const categories = getCategories();

  const history = loadCategoryIndexHistory(realm, window + 5);
  if (history.length < minPoints) {
    return { t: new Date().toISOString(), r: realm, w: window, m: {}, tp: [], sh: {}, ok: false, error: `insufficient index history (${history.length} snapshots, need >=${minPoints})` };
  }

  const catValues: Record<string, number[]> = {};
  for (const cat of categories) {
    catValues[cat] = history.map((h) => h.values[cat]).filter((v): v is number => v !== undefined && v > 0);
  }

  const m: Record<string, Record<string, CorrPair>> = {};
  categories.forEach((cat) => { m[cat] = {}; });
  const tp: Array<{ a: string; b: string; r: number; s: string; n: number }> = [];

  for (let i = 0; i < categories.length; i++) {
    for (let j = 0; j < categories.length; j++) {
      if (i === j) { m[categories[i]][categories[j]] = { r: 1, s: "strong", n: 1 }; continue; }
      if (j < i) { m[categories[i]][categories[j]] = m[categories[j]][categories[i]]; continue; }

      const xs = catValues[categories[i]];
      const ys = catValues[categories[j]];
      const n = Math.min(xs.length, ys.length);
      const alignedXs = xs.slice(-n);
      const alignedYs = ys.slice(-n);
      const r = Math.round(pearson(alignedXs, alignedYs) * 10000) / 10000;
      const p: CorrPair = { r, s: strength(r), n };
      m[categories[i]][categories[j]] = p;
      m[categories[j]][categories[i]] = p;
      tp.push({ a: categories[i], b: categories[j], r, s: p.s, n });
    }
  }

  tp.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

  const prev = loadPrevious(realm);
  const sh: Record<string, { cu: number; pr: number; de: number }> = {};
  if (prev) {
    for (const p of tp) {
      const key = `${p.a}-${p.b}`;
      const prevR = prev.m[p.a]?.[p.b]?.r;
      if (prevR !== undefined) {
        sh[key] = { cu: p.r, pr: prevR, de: Math.round((p.r - prevR) * 10000) / 10000 };
      }
    }
  }

  return {
    t: new Date().toISOString(), r: realm, w: window,
    m, tp, sh, ok: true,
  };
}

export function computeAllCorrelations(): Promise<{ ok: boolean; results: CorrelationResult[] }> {
  const cfg = loadConfig();
  const results = cfg.simco.realms.map((r) => {
    try { return computeCorrelations(r); }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { t: new Date().toISOString(), r, w: 0, m: {}, tp: [], sh: {}, ok: false, error: msg };
    }
  });
  const allOk = results.some((r) => r.ok);
  logger.info(`Correlations computed: ${results.filter((r) => r.ok).length}/${results.length} realms ok`);
  return Promise.resolve({ ok: allOk, results });
}
