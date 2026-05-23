import { readdirSync, existsSync } from "fs";
import { join } from "path";
import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import { SimcoToolsClient } from "../api/simcoTools.js";
import { DataRepoWriter } from "../storage/dataRepoWriter.js";

const BACKFILL_START = "2026-02-23";

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getYesterday(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

function extractDate(candle: any): string | null {
  const raw = candle.date ?? candle.datetime ?? candle.t;
  if (!raw) return null;
  return String(raw).slice(0, 10);
}

function extractVwap(candle: any): number | undefined {
  return candle.vwap ?? candle.vw ?? candle.value ?? candle.close;
}

export interface VWAPInflationResult {
  ok: boolean;
  datesProcessed: number;
  datesSkipped: number;
  totalDates: number;
  totalApiCalls: number;
  filesWritten: number;
  resourcesFound: number;
  durationMs: number;
  errors: string[];
}

interface VWAPData {
  t: string;
  r: number;
  overall: { vw: number; n: number };
  quality: Record<string, { vw: number; n: number }>;
  product: Record<string, { nm: string; vw: number }>;
  both: Record<string, { nm: string; vw: number }>;
}

export async function runVWAPInflation(realm: number): Promise<VWAPInflationResult> {
  const start = Date.now();
  const cfg = loadConfig();
  const client = new SimcoToolsClient(realm, cfg.simco.apiBaseUrl, 100);
  const writer = new DataRepoWriter(cfg.dataRepo);

  logger.info(`[vwap-inflation realm ${realm}] Fetching resources...`);
  let resources: { id: number; name: string }[];
  try {
    const res = await client.getResources(true);
    resources = res.resources ?? [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, datesProcessed: 0, datesSkipped: 0, totalDates: 0, totalApiCalls: 0, filesWritten: 0, resourcesFound: 0, durationMs: 0, errors: [`getResources failed: ${msg}`] };
  }

  logger.info(`[vwap-inflation realm ${realm}] Found ${resources.length} resources`);

  const startDate = new Date(BACKFILL_START);
  const yesterday = getYesterday();
  const allDates: string[] = [];
  const cur = new Date(startDate);
  while (cur <= yesterday) {
    allDates.push(formatDate(cur));
    cur.setDate(cur.getDate() + 1);
  }

  const dir = join(cfg.dataRepo.path, `aggregates/vwap-inflation/realm-${realm}`);
  const existing: Set<string> = new Set();
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      if (f.startsWith("vwap-inflation-") && f.endsWith(".json")) {
        existing.add(f.slice(16, 26));
      }
    }
  }
  logger.info(`[vwap-inflation realm ${realm}] ${existing.size}/${allDates.length} dates already have data`);

  if (existing.size >= allDates.length) {
    return { ok: true, datesProcessed: 0, datesSkipped: allDates.length, totalDates: allDates.length, totalApiCalls: 0, filesWritten: 0, resourcesFound: resources.length, durationMs: Date.now() - start, errors: [] };
  }

  const resourceNames = new Map(resources.map(r => [r.id, r.name]));

  const dateData: Map<string, {
    overallSum: number; overallCount: number;
    qualitySums: Map<number, { sum: number; count: number }>;
    productQ0: Map<number, number>;
    both: Map<string, number>;
  }> = new Map();

  const qualitiesToFetch = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  let totalApiCalls = 0;

  for (const [idx, res] of resources.entries()) {
    if (idx > 0 && idx % 20 === 0) {
      logger.info(`[vwap-inflation] Progress: ${idx}/${resources.length} resources (${totalApiCalls} API calls)`);
    }

    const results = await Promise.allSettled(
      qualitiesToFetch.map(q =>
        client.getMarketCandlesticks(res.id, q, BACKFILL_START, formatDate(yesterday))
          .then(candles => ({ q, candles }))
          .catch(() => ({ q, candles: [] as any[] }))
      )
    );

    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      const { q, candles } = r.value;
      totalApiCalls++;
      if (!candles || candles.length === 0) continue;

      for (const c of candles) {
        const d = extractDate(c);
        const vwap = extractVwap(c);
        if (!d || vwap === undefined || vwap === null) continue;

        if (!dateData.has(d)) {
          dateData.set(d, {
            overallSum: 0, overallCount: 0,
            qualitySums: new Map(),
            productQ0: new Map(),
            both: new Map(),
          });
        }

        const dd = dateData.get(d)!;
        const qSum = dd.qualitySums.get(q) ?? { sum: 0, count: 0 };
        qSum.sum += vwap;
        qSum.count++;
        dd.qualitySums.set(q, qSum);

        if (q === 0) {
          dd.overallSum += vwap;
          dd.overallCount++;
          dd.productQ0.set(res.id, vwap);
        }

        dd.both.set(`${res.id}_${q}`, vwap);
      }
    }
  }

  logger.info(`[vwap-inflation realm ${realm}] Fetched ${totalApiCalls} API calls, covering ${dateData.size} dates`);

  let processed = 0;
  let skipped = 0;
  let filesWritten = 0;
  const errors: string[] = [];

  const sortedDates = allDates.filter(d => dateData.has(d)).sort();

  for (const dateStr of sortedDates) {
    if (existing.has(dateStr)) {
      skipped++;
      continue;
    }

    const dd = dateData.get(dateStr)!;

    const data: VWAPData = {
      t: dateStr,
      r: realm,
      overall: {
        vw: dd.overallCount > 0 ? Math.round((dd.overallSum / dd.overallCount) * 10000) / 10000 : 0,
        n: dd.overallCount,
      },
      quality: {},
      product: {},
      both: {},
    };

    for (const [q, qd] of dd.qualitySums) {
      data.quality[String(q)] = {
        vw: qd.count > 0 ? Math.round((qd.sum / qd.count) * 10000) / 10000 : 0,
        n: qd.count,
      };
    }

    for (const [rid, vw] of dd.productQ0) {
      data.product[String(rid)] = {
        nm: resourceNames.get(rid) ?? `Resource ${rid}`,
        vw: Math.round(vw * 10000) / 10000,
      };
    }

    for (const [key, vw] of dd.both) {
      const [ridStr] = key.split("_");
      const rid = Number(ridStr);
      data.both[key] = {
        nm: resourceNames.get(rid) ?? `Resource ${rid}`,
        vw: Math.round(vw * 10000) / 10000,
      };
    }

    try {
      await writer.writeSnapshot(
        { timestamp: dateStr, snapshotType: "vwap-inflation", data },
        `aggregates/vwap-inflation/realm-${realm}`
      );
      filesWritten++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`write ${dateStr}: ${msg}`);
    }

    processed++;
    if (processed % 10 === 0) {
      logger.info(`[vwap-inflation] Processed ${processed}/${sortedDates.length} dates`);
    }
  }

  const durationMs = Date.now() - start;
  logger.info(`[vwap-inflation realm ${realm}] Done: ${processed} dates, ${skipped} skipped, ${filesWritten} files, ${errors.length} errors in ${durationMs}ms`);

  return {
    ok: errors.length === 0,
    datesProcessed: processed,
    datesSkipped: skipped + (allDates.length - sortedDates.length),
    totalDates: allDates.length,
    totalApiCalls,
    filesWritten,
    resourcesFound: resources.length,
    durationMs,
    errors,
  };
}

export async function runAllVWAPInflation(): Promise<{ ok: boolean; results: Array<{ realm: number } & VWAPInflationResult> }> {
  const cfg = loadConfig();
  const results = await Promise.allSettled(
    cfg.simco.realms.map(async (r) => {
      const res = await runVWAPInflation(r);
      return { realm: r, ...res };
    }),
  );

  const fulfilled: Array<{ realm: number } & VWAPInflationResult> = [];
  let allOk = true;
  for (const r of results) {
    if (r.status === "fulfilled") {
      fulfilled.push(r.value);
      if (!r.value.ok) allOk = false;
    } else {
      allOk = false;
    }
  }

  if (fulfilled.some(r => r.filesWritten > 0)) {
    try {
      const writer = new DataRepoWriter(cfg.dataRepo);
      await writer.commitAndPush("auto: vwap inflation data");
    } catch (err) {
      logger.warn(`vwap-inflation commitAndPush failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  return { ok: allOk, results: fulfilled };
}
