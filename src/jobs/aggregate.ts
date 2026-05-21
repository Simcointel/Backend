import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, join } from "path";
import { logger } from "../logging/logger.js";
import { DataRepoWriter } from "../storage/dataRepoWriter.js";
import type { MarketSnapshot } from "./fetchJob.js";

export interface AggregationResult {
  ok: boolean;
  summaryPath: string | null;
  resourceCount: number;
  latestVwaps: number;
  error?: string;
}

interface CompactSummary {
  t: string;
  r: number;
  rn: number;
  vn: number;
  vs: Record<number, Record<number, number>>;
  ss: string;
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

export async function runAggregation(dataRepoPath: string, realm: number): Promise<AggregationResult> {
  const snapshotPath = findLatestSnapshot(dataRepoPath, realm);

  if (!snapshotPath) {
    logger.warn("No snapshots found for aggregation");
    return { ok: false, summaryPath: null, resourceCount: 0, latestVwaps: 0, error: "no snapshots found" };
  }

  let snapshot: MarketSnapshot;
  try {
    const raw = readFileSync(snapshotPath, "utf-8");
    snapshot = JSON.parse(raw) as MarketSnapshot;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Failed to read latest snapshot", msg);
    return { ok: false, summaryPath: null, resourceCount: 0, latestVwaps: 0, error: msg };
  }

  const vwapMap: Record<number, Record<number, number>> = {};
  for (const v of snapshot.vw) {
    if (!vwapMap[v.i]) vwapMap[v.i] = {};
    vwapMap[v.i][v.q] = v.v;
  }

  const summary: CompactSummary = {
    t: snapshot.t,
    r: snapshot.r,
    rn: snapshot.rc.length,
    vn: snapshot.vw.length,
    vs: vwapMap,
    ss: snapshotPath,
  };

  const writer = new DataRepoWriter({ path: dataRepoPath, githubToken: "", owner: "", repo: "", branch: "main" });
  const subDir = `aggregates/market/realm-${realm}`;

  try {
    const timestamp = new Date().toISOString().replace(/:/g, "-");
    const filePath = await writer.writeSnapshot(
      { timestamp, snapshotType: "market-summary", data: summary },
      subDir,
    );

    logger.info(`Aggregation complete: ${snapshot.rc.length} resources, ${snapshot.vw.length} VWAPs`);
    return { ok: true, summaryPath: filePath, resourceCount: snapshot.rc.length, latestVwaps: snapshot.vw.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Failed to write aggregation summary", msg);
    return { ok: false, summaryPath: null, resourceCount: snapshot.rc.length, latestVwaps: snapshot.vw.length, error: msg };
  }
}
