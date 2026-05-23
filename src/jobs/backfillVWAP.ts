import { readFileSync, readdirSync, existsSync } from "fs";
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

export interface BackfillResult {
  ok: boolean;
  datesProcessed: number;
  datesSkipped: number;
  totalDates: number;
  totalApiCalls: number;
  resourceVwapsWritten: number;
  indexesWritten: number;
  inflationWritten: number;
  durationMs: number;
  errors: string[];
}

export async function runBackfillVWAP(realm: number): Promise<BackfillResult> {
  const start = Date.now();
  const cfg = loadConfig();
  const categories = cfg.macroIndexes.categories;
  if (!categories || Object.keys(categories).length === 0) {
    return { ok: false, datesProcessed: 0, datesSkipped: 0, totalDates: 0, totalApiCalls: 0, resourceVwapsWritten: 0, indexesWritten: 0, inflationWritten: 0, durationMs: 0, errors: ["no categories defined"] };
  }

  const allResourceIds = new Set<number>();
  for (const cat of Object.values(categories)) {
    for (const rid of cat.resourceIds) {
      allResourceIds.add(rid);
    }
  }
  const resourceIds = [...allResourceIds];

  const startDate = new Date(BACKFILL_START);
  const yesterday = getYesterday();

  const allDates: string[] = [];
  const cur = new Date(startDate);
  while (cur <= yesterday) {
    allDates.push(formatDate(cur));
    cur.setDate(cur.getDate() + 1);
  }

  logger.info(`[backfill-vwap realm ${realm}] Starting backfill from ${BACKFILL_START} to ${formatDate(yesterday)} (${allDates.length} dates)`);
  logger.info(`[backfill-vwap realm ${realm}] ${resourceIds.length} resources to fetch`);

  const dir = join(cfg.dataRepo.path, `aggregates/resource-vwap/realm-${realm}`);

  const existing: Set<string> = new Set();
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      if (f.startsWith("resource-vwap-") && f.endsWith(".json")) {
        existing.add(f.slice(14, 24));
      }
    }
  }
  logger.info(`[backfill-vwap] ${existing.size} dates already have resource-vwap data`);

  if (existing.size >= allDates.length) {
    logger.info(`[backfill-vwap] All dates already backfilled — nothing to do`);
    return { ok: true, datesProcessed: 0, datesSkipped: allDates.length, totalDates: allDates.length, totalApiCalls: 0, resourceVwapsWritten: 0, indexesWritten: 0, inflationWritten: 0, durationMs: Date.now() - start, errors: [] };
  }

  const client = new SimcoToolsClient(realm, cfg.simco.apiBaseUrl, 100);
  const writer = new DataRepoWriter(cfg.dataRepo);

  const dateResourceVwap: Map<string, Map<number, Map<number, number>>> = new Map();
  let totalApiCalls = 0;

  for (const rid of resourceIds) {
    const qualitiesToTry: number[] = [];
    for (let q = 0; q <= 12; q++) qualitiesToTry.push(q);

    const results = await Promise.allSettled(
      qualitiesToTry.map(q =>
        client.getMarketCandlesticks(rid, q, BACKFILL_START, formatDate(yesterday))
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
        if (!dateResourceVwap.has(d)) dateResourceVwap.set(d, new Map());
        if (!dateResourceVwap.get(d)!.has(rid)) dateResourceVwap.get(d)!.set(rid, new Map());
        dateResourceVwap.get(d)!.get(rid)!.set(q, vwap);
      }
    }
  }

  logger.info(`[backfill-vwap] Fetched candlesticks for ${resourceIds.length} resources × up to 13 qualities (${totalApiCalls} calls), covering ${dateResourceVwap.size} dates`);

  const datesWithData = allDates.filter(d => dateResourceVwap.has(d));
  logger.info(`[backfill-vwap] ${datesWithData.length} dates have VWAP data after filtering`);

  let processed = 0;
  let skipped = 0;
  let rvWritten = 0;
  let ixWritten = 0;
  let infWritten = 0;
  const errors: string[] = [];

  let lastCpi: number | null = null;
  let lastCoreCpi: number | null = null;
  const indexDir = join(cfg.dataRepo.path, `aggregates/indexes/realm-${realm}`);

  const sortedDates = datesWithData.sort();

  for (const dateStr of sortedDates) {
    if (existing.has(dateStr)) {
      skipped++;
      const prevIndexFile = join(indexDir, `price-indexes-${dateStr}.json`);
      if (existsSync(prevIndexFile)) {
        try {
          const prev = JSON.parse(readFileSync(prevIndexFile, "utf-8"));
          if (prev?.ix?.cpi?.v != null) lastCpi = prev.ix.cpi.v;
          if (prev?.ix?.["core-cpi"]?.v != null) lastCoreCpi = prev.ix["core-cpi"].v;
        } catch {}
      }
      continue;
    }

    const rvData = dateResourceVwap.get(dateStr)!;

    const resourceVwaps: Record<number, number> = {};
    for (const [rid, qualities] of rvData) {
      let sum = 0, count = 0;
      for (const v of qualities.values()) {
        sum += v;
        count++;
      }
      if (count > 0) {
        resourceVwaps[rid] = Math.round((sum / count) * 10000) / 10000;
      }
    }

    try {
      await writer.writeSnapshot(
        { timestamp: dateStr, snapshotType: "resource-vwap", data: { t: dateStr, r: realm, vw: resourceVwaps } },
        `aggregates/resource-vwap/realm-${realm}`
      );
      rvWritten++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`resource-vwap ${dateStr}: ${msg}`);
    }

    const indexes: Record<string, { v: number; n: number; rn: number }> = {};
    for (const [key, cat] of Object.entries(categories)) {
      let sum = 0, tracked = 0;
      for (const rid of cat.resourceIds) {
        const v = resourceVwaps[rid];
        if (v !== undefined) {
          sum += v;
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

    const indexReport = { t: dateStr, r: realm, sr: "", ix: indexes };

    try {
      await writer.writeSnapshot(
        { timestamp: dateStr, snapshotType: "price-indexes", data: indexReport },
        `aggregates/indexes/realm-${realm}`
      );
      ixWritten++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`price-indexes ${dateStr}: ${msg}`);
    }

    const cpiValue = indexes["cpi"]?.v ?? null;
    if (cpiValue != null && lastCpi != null && lastCpi > 0) {
      const ch = Math.round(((cpiValue - lastCpi) / lastCpi) * 10000) / 100;
      const inflation: Record<string, { cv: number; pv: number; ch: number }> = {};

      for (const [key] of Object.entries(categories)) {
        const cur = indexes[key];
        if (!cur) continue;
        inflation[key] = { cv: cur.v, pv: cur.v, ch: 0 };
      }

      inflation["cpi"] = { cv: cpiValue, pv: lastCpi, ch };
      const coreCur = indexes["core-cpi"]?.v ?? null;
      if (coreCur != null && lastCoreCpi != null && lastCoreCpi > 0) {
        const coreCh = Math.round(((coreCur - lastCoreCpi) / lastCoreCpi) * 10000) / 100;
        inflation["core-cpi"] = { cv: coreCur, pv: lastCoreCpi, ch: coreCh };
      }

      const infReport = { t: dateStr, r: realm, lb: 1, in: inflation };

      try {
        await writer.writeSnapshot(
          { timestamp: dateStr, snapshotType: "inflation-report", data: infReport },
          `aggregates/inflation/realm-${realm}`
        );
        infWritten++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`inflation-report ${dateStr}: ${msg}`);
      }
    }

    if (cpiValue != null) lastCpi = cpiValue;
    if (indexes["core-cpi"]?.v != null) lastCoreCpi = indexes["core-cpi"].v;

    processed++;
    if (processed % 10 === 0) {
      logger.info(`[backfill-vwap] Progress: ${processed}/${datesWithData.length} dates processed`);
    }
  }

  const durationMs = Date.now() - start;
  logger.info(`[backfill-vwap] Complete: ${processed} processed, ${skipped} skipped, ${errors.length} errors in ${durationMs}ms`);
  if (errors.length > 0) {
    for (const e of errors) logger.warn(`[backfill-vwap] Error: ${e}`);
  }

  return {
    ok: errors.length === 0,
    datesProcessed: processed,
    datesSkipped: skipped + (allDates.length - datesWithData.length),
    totalDates: allDates.length,
    totalApiCalls,
    resourceVwapsWritten: rvWritten,
    indexesWritten: ixWritten,
    inflationWritten: infWritten,
    durationMs,
    errors,
  };
}

export async function runAllBackfillVWAP(): Promise<{ ok: boolean; results: Array<{ realm: number } & BackfillResult> }> {
  const cfg = loadConfig();
  const results = await Promise.allSettled(
    cfg.simco.realms.map(async (r) => {
      const res = await runBackfillVWAP(r);
      return { realm: r, ...res };
    }),
  );

  const fulfilled: Array<{ realm: number } & BackfillResult> = [];
  let allOk = true;
  for (const r of results) {
    if (r.status === "fulfilled") {
      fulfilled.push(r.value);
      if (!r.value.ok) allOk = false;
    } else {
      allOk = false;
    }
  }

  if (fulfilled.some(r => r.resourceVwapsWritten > 0 || r.indexesWritten > 0)) {
    try {
      const writer = new DataRepoWriter(cfg.dataRepo);
      await writer.commitAndPush("auto: backfill VWAP historical data");
    } catch (err) {
      logger.warn(`Backfill commitAndPush failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  return { ok: allOk, results: fulfilled };
}
