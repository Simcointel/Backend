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
