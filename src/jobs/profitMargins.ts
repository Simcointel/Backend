import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, join } from "path";
import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import { DataRepoWriter } from "../storage/dataRepoWriter.js";
import type { MarketSnapshot } from "./fetchJob.js";

export interface ProfitEntry {
  i: number;
  n: string;
  c: string;
  cn: string;
  ph: number;
  rv: number;
  ic: number;
  wg: number;
  tr: number;
  np: number;
  mg: number;
  vw: number;
  ir: boolean;
  m1?: number;
  n1?: number;
  md?: "up" | "down" | "flat";
  fp?: number;
  td?: "improving" | "declining" | "stable";
}

export interface ProfitMarginsReport {
  t: string;
  r: number;
  sr: string;
  rs: ProfitEntry[];
}

function findLatestSnapshot(dataRepoPath: string, realm: number): string | null {
  const dir = resolve(dataRepoPath, "snapshots", "market", `realm-${realm}`);
  if (!existsSync(dir)) return null;

  const files = readdirSync(dir)
    .filter((f) => f.startsWith("market-snapshot-") && f.endsWith(".json"))
    .sort()
    .reverse();

  return files.length > 0 ? join(dir, files[0]) : null;
}

function buildResourceMap(snapshot: MarketSnapshot): Map<number, { n: string; ph: number; w: number; tr: number; inputs: Map<number, number>; ir: boolean }> {
  const map = new Map();
  for (const r of snapshot.rc) {
    map.set(r.i, {
      n: r.n,
      ph: r.ph,
      w: r.w,
      tr: r.tr,
      inputs: new Map(Object.entries(r.in).map(([id, qty]) => [Number(id), qty])),
      ir: r.ir,
    });
  }
  return map;
}

function buildVwapMap(snapshot: MarketSnapshot): Map<number, Map<number, number>> {
  const map = new Map<number, Map<number, number>>();
  for (const v of snapshot.vw) {
    if (!map.has(v.i)) map.set(v.i, new Map());
    map.get(v.i)!.set(v.q, v.v);
  }
  return map;
}

function findMarginsFiles(dataRepoPath: string, realm: number, limit: number): string[] {
  const dir = resolve(dataRepoPath, "aggregates", "profit-margins", `realm-${realm}`);
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((f) => f.startsWith("profit-margins-") && f.endsWith(".json") && f !== "index.json")
    .sort()
    .reverse()
    .slice(0, limit)
    .map((f) => join(dir, f));
}

function computeDeltas(current: ProfitEntry[], previous: ProfitEntry[]): ProfitEntry[] {
  const prevMap = new Map<number, ProfitEntry>();
  for (const p of previous) prevMap.set(p.i, p);

  return current.map((e) => {
    const prev = prevMap.get(e.i);
    if (!prev) return e;

    const marginDelta = e.mg - prev.mg;
    const profitDelta = e.np - prev.np;
    let direction: "up" | "down" | "flat" = "flat";
    if (marginDelta > 0.5) direction = "up";
    else if (marginDelta < -0.5) direction = "down";

    return {
      ...e,
      m1: Math.round(marginDelta * 100) / 100,
      n1: Math.round(profitDelta * 100) / 100,
      md: direction,
    };
  });
}

function findPreviousMarginsFile(dataRepoPath: string, realm: number): string | null {
  const files = findMarginsFiles(dataRepoPath, realm, 1);
  return files.length > 0 ? files[0] : null;
}

function computeProjections(current: ProfitEntry[], prevFiles: string[]): ProfitEntry[] {
  const marginHistory = new Map<number, number[]>();
  for (const f of prevFiles) {
    try {
      const report = JSON.parse(readFileSync(f, "utf-8")) as ProfitMarginsReport;
      if (!report.rs) continue;
      for (const e of report.rs) {
        if (!marginHistory.has(e.i)) marginHistory.set(e.i, []);
        marginHistory.get(e.i)!.push(e.mg);
      }
    } catch {
      continue;
    }
  }

  return current.map((e) => {
    const history = marginHistory.get(e.i);
    if (!history || history.length < 2) return e;

    const allValues = [...history, e.mg];
    const n = allValues.length;
    const indices = Array.from({ length: n }, (_, i) => i);
    const xMean = (n - 1) / 2;
    const yMean = allValues.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - xMean) * (allValues[i] - yMean);
      den += (i - xMean) ** 2;
    }
    const slope = den > 0 ? num / den : 0;
    const projected = e.mg + slope;

    const absSlope = Math.abs(slope);
    const trend: "improving" | "declining" | "stable" = slope > 0.3 ? "improving" : slope < -0.3 ? "declining" : "stable";

    return {
      ...e,
      fp: Math.round(projected * 100) / 100,
      td: trend,
    };
  });
}

function getBestVwap(resourceId: number, vwapMap: Map<number, Map<number, number>>): number | undefined {
  const quals = vwapMap.get(resourceId);
  if (!quals || quals.size === 0) return undefined;
  if (quals.has(0)) return quals.get(0);
  const best = [...quals.entries()].sort((a, b) => b[0] - a[0]);
  return best[0]?.[1];
}

export function computeProfitMargins(realm: number): ProfitMarginsReport & { ok: boolean; error?: string } {
  const cfg = loadConfig();
  const categories = cfg.macroIndexes.categories;
  const marketFeePct = cfg.formulas.marketFeePct ?? 4;
  const transportMultiplier = cfg.formulas.defaultTransportCostMultiplier ?? 1;

  const snapshotPath = findLatestSnapshot(cfg.dataRepo.path, realm);
  if (!snapshotPath) {
    return { t: new Date().toISOString(), r: realm, sr: "", rs: [], ok: false, error: "no market snapshot found" };
  }

  let snapshot: MarketSnapshot;
  try {
    snapshot = JSON.parse(readFileSync(snapshotPath, "utf-8")) as MarketSnapshot;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { t: new Date().toISOString(), r: realm, sr: snapshotPath, rs: [], ok: false, error: `failed to read snapshot: ${msg}` };
  }

  const resources = buildResourceMap(snapshot);
  const vwaps = buildVwapMap(snapshot);

  const resourceToCategory = new Map<number, { key: string; name: string }>();
  for (const [key, cat] of Object.entries(categories)) {
    for (const rid of cat.resourceIds) {
      resourceToCategory.set(rid, { key, name: cat.name });
    }
  }

  const entries: ProfitEntry[] = [];

  for (const [rid, res] of resources) {
    if (res.ir) continue;

    const outputVwap = getBestVwap(rid, vwaps);
    if (outputVwap === undefined) continue;

    const revenue = res.ph * outputVwap;
    const marketFee = revenue * (marketFeePct / 100);
    const netRevenue = revenue - marketFee;

    let inputCost = 0;
    let allInputsHavePrices = true;
    for (const [inputId, inputQty] of res.inputs) {
      const inputVwap = getBestVwap(inputId, vwaps);
      if (inputVwap === undefined) {
        allInputsHavePrices = false;
        break;
      }
      inputCost += inputQty * res.ph * inputVwap;
    }

    if (!allInputsHavePrices && res.inputs.size > 0) continue;

    const wages = res.w;
    const transport = res.tr * transportMultiplier;

    const netProfit = netRevenue - inputCost - wages - transport;
    const margin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

    const cat = resourceToCategory.get(rid) ?? { key: "other", name: "Other" };

    entries.push({
      i: rid,
      n: res.n,
      c: cat.key,
      cn: cat.name,
      ph: res.ph,
      rv: Math.round(netRevenue * 100) / 100,
      ic: Math.round(inputCost * 100) / 100,
      wg: Math.round(wages * 100) / 100,
      tr: Math.round(transport * 100) / 100,
      np: Math.round(netProfit * 100) / 100,
      mg: Math.round(margin * 100) / 100,
      vw: Math.round(outputVwap * 10000) / 10000,
      ir: false,
    });
  }

  entries.sort((a, b) => b.mg - a.mg);

  try {
    const prevFile = findPreviousMarginsFile(cfg.dataRepo.path, realm);
    if (prevFile) {
      const prevData = JSON.parse(readFileSync(prevFile, "utf-8")) as ProfitMarginsReport;
      if (prevData.rs) {
        const withDeltas = computeDeltas(entries, prevData.rs);
        entries.length = 0;
        entries.push(...withDeltas);
      }
    }
  } catch {
    logger.debug(`[realm ${realm}] Could not read previous margins for deltas`);
  }

  try {
    const histFiles = findMarginsFiles(cfg.dataRepo.path, realm, 7);
    if (histFiles.length > 1) {
      const withProjections = computeProjections(entries, histFiles.slice(1));
      entries.length = 0;
      entries.push(...withProjections);
    }
  } catch {
    logger.debug(`[realm ${realm}] Could not compute projections`);
  }

  const report: ProfitMarginsReport = {
    t: new Date().toISOString(),
    r: realm,
    sr: snapshotPath,
    rs: entries,
  };

  return { ...report, ok: true };
}

export async function runProfitMargins(realm: number): Promise<{ ok: boolean; report: ProfitMarginsReport | null; error?: string }> {
  const result = computeProfitMargins(realm);
  if (!result.ok) {
    return { ok: false, report: null, error: result.error };
  }

  const { ok: _ok, error: _err, ...report } = result;
  const typedReport: ProfitMarginsReport = report;

  try {
    const cfg = loadConfig();
    const writer = new DataRepoWriter({ path: cfg.dataRepo.path, githubToken: "", owner: "", repo: "", branch: "main" });
    const timestamp = new Date().toISOString().replace(/:/g, "-");
    const subDir = `aggregates/profit-margins/realm-${realm}`;
    await writer.writeSnapshot(
      { timestamp, snapshotType: "profit-margins", data: typedReport },
      subDir,
    );
    logger.info(`[realm ${realm}] Profit margins computed: ${typedReport.rs.length} resources`);
    return { ok: true, report: typedReport };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, report: null, error: `write failed: ${msg}` };
  }
}

export async function runAllProfitMargins(): Promise<{ ok: boolean; results: Array<{ realm: number; ok: boolean; count: number }> }> {
  const cfg = loadConfig();
  const results = await Promise.allSettled(
    cfg.simco.realms.map(async (r) => {
      const res = await runProfitMargins(r);
      return { realm: r, ok: res.ok, count: res.report?.rs.length ?? 0 };
    }),
  );

  const fulfilled: Array<{ realm: number; ok: boolean; count: number }> = [];
  let allOk = true;
  for (const r of results) {
    if (r.status === "fulfilled") {
      fulfilled.push(r.value);
      if (!r.value.ok) allOk = false;
    } else {
      allOk = false;
    }
  }

  const totalResources = fulfilled.reduce((s, r) => s + r.count, 0);
  logger.info(`Profit margins: ${fulfilled.filter((r) => r.ok).length}/${fulfilled.length} realms ok, ${totalResources} resources`);
  return { ok: allOk, results: fulfilled };
}
