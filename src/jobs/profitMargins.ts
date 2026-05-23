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
