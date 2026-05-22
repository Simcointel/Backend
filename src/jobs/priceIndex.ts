import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, join } from "path";
import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import { DataRepoWriter } from "../storage/dataRepoWriter.js";
import type { MarketSnapshot } from "./fetchJob.js";

export interface IndexValue {
  category: string;
  categoryName: string;
  timestamp: string;
  value: number;
  resourceCount: number;
  resourcesTracked: number;
}

export interface IndexReport {
  t: string;
  r: number;
  sr: string;
  ix: Record<string, { v: number; n: number; rn: number }>;
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

function findSnapshots(dataRepoPath: string, realm: number, limit: number): string[] {
  const dir = resolve(dataRepoPath, "snapshots", "market", `realm-${realm}`);
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((f) => f.startsWith("market-snapshot-") && f.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, limit)
    .map((f) => join(dir, f));
}

export async function runPriceIndexes(realm: number): Promise<{ ok: boolean; indexes: IndexReport["ix"] | null; error?: string }> {
  const cfg = loadConfig();
  const categories = cfg.macroIndexes.categories;
  if (!categories || Object.keys(categories).length === 0) {
    return { ok: false, indexes: null, error: "no categories defined" };
  }

  const snapshotPath = findLatestSnapshot(cfg.dataRepo.path, realm);
  if (!snapshotPath) {
    return { ok: false, indexes: null, error: "no snapshot found" };
  }

  let snapshot: MarketSnapshot;
  try {
    snapshot = JSON.parse(readFileSync(snapshotPath, "utf-8")) as MarketSnapshot;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, indexes: null, error: `failed to read snapshot: ${msg}` };
  }

  const vwapMap = new Map<number, Map<number, number>>();
  for (const v of snapshot.vw) {
    if (!vwapMap.has(v.i)) vwapMap.set(v.i, new Map());
    vwapMap.get(v.i)!.set(v.q, v.v);
  }

  const indexes: IndexReport["ix"] = {};

  for (const [key, cat] of Object.entries(categories)) {
    let sum = 0;
    let tracked = 0;
    for (const rid of cat.resourceIds) {
      const quals = vwapMap.get(rid);
      if (!quals) continue;
      let qSum = 0;
      let qCount = 0;
      for (const v of quals.values()) {
        qSum += v;
        qCount++;
      }
      if (qCount > 0) {
        sum += qSum / qCount;
        tracked++;
      }
    }

    if (tracked > 0) {
      indexes[key] = {
        v: Math.round((sum / tracked) * 10000) / 10000,
        n: tracked,
        rn: cat.resourceIds.length,
      };
    }
  }

  if (Object.keys(indexes).length === 0) {
    return { ok: false, indexes: null, error: "no resources matched" };
  }

  const ixVals = Object.entries(indexes).filter(([k, v]) => k !== "gdp" && v.v > 0).map(([_, v]) => v);
  if (ixVals.length > 0) {
    const cpiAvg = ixVals.reduce((s, v) => s + v.v, 0) / ixVals.length;
    indexes["cpi"] = { v: Math.round(cpiAvg * 10000) / 10000, n: ixVals.length, rn: ixVals.length };
    const coreVals = Object.entries(indexes).filter(([k, v]) => k !== "gdp" && k !== "energy-fuel" && v.v > 0).map(([_, v]) => v);
    if (coreVals.length > 0) {
      const coreAvg = coreVals.reduce((s, v) => s + v.v, 0) / coreVals.length;
      indexes["core-cpi"] = { v: Math.round(coreAvg * 10000) / 10000, n: coreVals.length, rn: coreVals.length };
    }
  }

  try {
    const statusDir = resolve(cfg.dataRepo.path, "aggregates", "realm-status", `realm-${realm}`);
    if (existsSync(statusDir)) {
      const statusFiles = readdirSync(statusDir)
        .filter((f) => f.startsWith("realm-status-") && f.endsWith(".json"))
        .sort()
        .reverse();
      if (statusFiles.length > 0) {
        const status = JSON.parse(readFileSync(join(statusDir, statusFiles[0]), "utf-8")) as { cv: number };
        indexes["gdp"] = { v: status.cv, n: 1, rn: 1 };
      }
    }
  } catch {
    logger.warn(`[realm ${realm}] Could not read CV for GDP override`);
  }

  const report: IndexReport = {
    t: new Date().toISOString(),
    r: realm,
    sr: snapshotPath,
    ix: indexes,
  };

  try {
    const writer = new DataRepoWriter({ path: cfg.dataRepo.path, githubToken: "", owner: "", repo: "", branch: "main" });
    const timestamp = new Date().toISOString().replace(/:/g, "-");
    const subDir = `aggregates/indexes/realm-${realm}`;
    await writer.writeSnapshot(
      { timestamp, snapshotType: "price-indexes", data: report },
      subDir,
    );
    logger.info(`[realm ${realm}] Price indexes computed: ${Object.keys(indexes).length} categories`);
    return { ok: true, indexes };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, indexes: null, error: `write failed: ${msg}` };
  }
}

export async function runAllPriceIndexes(): Promise<{ ok: boolean; results: Array<{ realm: number; ok: boolean }> }> {
  const cfg = loadConfig();
  const results = await Promise.allSettled(
    cfg.simco.realms.map(async (r) => {
      const res = await runPriceIndexes(r);
      return { realm: r, ok: res.ok };
    }),
  );

  const fulfilled: Array<{ realm: number; ok: boolean }> = [];
  let allOk = true;
  for (const r of results) {
    if (r.status === "fulfilled") {
      fulfilled.push(r.value);
      if (!r.value.ok) allOk = false;
    } else {
      allOk = false;
    }
  }

  return { ok: allOk, results: fulfilled };
}
