import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, join } from "path";
import { logger } from "../logging/logger.js";
import { DataRepoWriter } from "../storage/dataRepoWriter.js";
import type { MarketSnapshot } from "./fetchJob.js";

export interface AnalyticsResult {
  ok: boolean;
  reportPath: string | null;
  snapshotsUsed: number;
  resourceCount: number;
  error?: string;
}

interface ResourceAnalytics {
  i: number;
  n: string;
  pr: Record<number, PriceAnalytics>;
}

interface PriceAnalytics {
  q: number;
  cu: number;
  ma: number;
  lo: number;
  hi: number;
  tr: "up" | "down" | "flat";
  ch: number;
}

export interface AnalyticsReport {
  t: string;
  r: number;
  sr: number;
  wa: ResourceAnalytics[];
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

function loadSnapshots(paths: string[]): MarketSnapshot[] {
  const result: MarketSnapshot[] = [];
  for (const p of paths) {
    try {
      result.push(JSON.parse(readFileSync(p, "utf-8")) as MarketSnapshot);
    } catch {
      logger.warn(`Skipping unreadable snapshot ${p}`);
    }
  }
  return result;
}

function computeTrend(values: number[]): "up" | "down" | "flat" {
  if (values.length < 2) return "flat";
  const half = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, half);
  const secondHalf = values.slice(half);
  const avg1 = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avg2 = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  const diff = ((avg2 - avg1) / avg1) * 100;
  if (diff > 2) return "up";
  if (diff < -2) return "down";
  return "flat";
}

export async function runExpandedAggregation(
  dataRepoPath: string,
  realm: number,
  windowSize: number,
): Promise<AnalyticsResult> {
  const paths = findSnapshots(dataRepoPath, realm, windowSize);
  if (paths.length === 0) {
    logger.warn(`No snapshots found for realm ${realm}`);
    return { ok: false, reportPath: null, snapshotsUsed: 0, resourceCount: 0, error: "no snapshots" };
  }

  const snapshots = loadSnapshots(paths);
  if (snapshots.length === 0) {
    return { ok: false, reportPath: null, snapshotsUsed: 0, resourceCount: 0, error: "no readable snapshots" };
  }

  const resourceIds = new Set<number>();
  for (const s of snapshots) {
    for (const r of s.rc) resourceIds.add(r.i);
  }

  const resourceMap = new Map<number, string>();
  for (const s of snapshots[0].rc) {
    resourceMap.set(s.i, s.n);
  }

  const analytics: ResourceAnalytics[] = [];

  for (const id of resourceIds) {
    const vwapByQuality = new Map<number, number[]>();

    for (const s of snapshots) {
      for (const v of s.vw) {
        if (v.i !== id) continue;
        if (!vwapByQuality.has(v.q)) vwapByQuality.set(v.q, []);
        vwapByQuality.get(v.q)!.push(v.v);
      }
    }

    const priceAnalytics: Record<number, PriceAnalytics> = {};

    for (const [q, values] of vwapByQuality) {
      const sorted = values.slice().sort((a, b) => a - b);
      const sum = values.reduce((a, b) => a + b, 0);
      priceAnalytics[q] = {
        q,
        cu: values[values.length - 1],
        ma: Math.round((sum / values.length) * 100) / 100,
        lo: sorted[0],
        hi: sorted[sorted.length - 1],
        tr: computeTrend(values),
        ch: values.length >= 2
          ? Math.round(((values[values.length - 1] - values[0]) / values[0]) * 10000) / 100
          : 0,
      };
    }

    analytics.push({
      i: id,
      n: resourceMap.get(id) ?? `res-${id}`,
      pr: priceAnalytics,
    });
  }

  const report: AnalyticsReport = {
    t: new Date().toISOString(),
    r: realm,
    sr: snapshots.length,
    wa: analytics,
  };

  const writer = new DataRepoWriter({ path: dataRepoPath, githubToken: "", owner: "", repo: "", branch: "main" });

  try {
    const timestamp = new Date().toISOString().replace(/:/g, "-");
    const subDir = `analytics/market/realm-${realm}`;
    const filePath = await writer.writeSnapshot(
      { timestamp, snapshotType: "market-analytics", data: report },
      subDir,
    );

    logger.info(`Analytics complete: ${analytics.length} resources across ${snapshots.length} snapshots`);
    return { ok: true, reportPath: filePath, snapshotsUsed: snapshots.length, resourceCount: analytics.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Failed to write analytics report", msg);
    return { ok: false, reportPath: null, snapshotsUsed: snapshots.length, resourceCount: analytics.length, error: msg };
  }
}
