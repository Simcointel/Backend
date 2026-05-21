import { loadConfig } from "../config/index.js";
import { logger } from "../logging/logger.js";
import { SimcoToolsClient, type Resource, type VwapEntry } from "../api/simcoTools.js";
import { DataRepoWriter } from "../storage/dataRepoWriter.js";

export interface FetchResult {
  ok: boolean;
  resourceCount: number;
  vwapCount: number;
  snapshotPath: string | null;
  durationMs: number;
  error?: string;
}

interface ShrunkResource {
  i: number;
  n: string;
  ph: number;
  w: number;
  tr: number;
  in: Record<number, number>;
  ir: boolean;
  sm: number;
}

interface ShrunkVwap {
  i: number;
  q: number;
  v: number;
  d?: string;
}

export interface MarketSnapshot {
  t: string;
  r: number;
  rc: ShrunkResource[];
  vw: ShrunkVwap[];
}

function shrinkResources(resources: Resource[]): ShrunkResource[] {
  return resources.map((r) => ({
    i: r.id,
    n: r.name,
    ph: r.producedAnHour,
    w: r.wages,
    tr: r.transportation,
    in: Object.fromEntries(
      Object.entries(r.inputs).map(([id, info]) => [Number(id), info.quantity]),
    ),
    ir: r.isResearch,
    sm: r.speedModifier,
  }));
}

function shrinkVwaps(vwaps: VwapEntry[]): ShrunkVwap[] {
  return vwaps.map((v) => ({ i: v.resourceId, q: v.quality, v: v.vwap, d: v.datetime }));
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry<T>(
  label: string,
  fn: () => Promise<T>,
  retries: number,
  delayMs: number,
): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await fn();
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`${label} failed (attempt ${attempt}/${retries}): ${msg}`);

      if (attempt < retries) {
        const wait = delayMs * 2 ** (attempt - 1);
        logger.debug(`retrying ${label} in ${wait}ms`);
        await sleep(wait);
      } else {
        throw err;
      }
    }
  }
  throw new Error("unreachable");
}

export async function runFetchForRealm(realm: number): Promise<FetchResult> {
  const start = Date.now();
  const cfg = loadConfig();

  const client = new SimcoToolsClient(realm);
  const writer = new DataRepoWriter(cfg.dataRepo);

  const retries = cfg.schedules.fetchRetryCount;
  const retryDelay = cfg.schedules.fetchRetryDelayMs;

  let resources: Resource[];
  let vwaps: VwapEntry[];

  try {
    logger.info(`[realm ${realm}] Fetching resources...`);
    const resp = await fetchWithRetry(
      `getResources(realm=${realm})`,
      () => client.getResources(true),
      retries,
      retryDelay,
    );
    resources = resp.resources;
    logger.info(`[realm ${realm}] Fetched ${resources.length} resources`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[realm ${realm}] Failed to fetch resources`, msg);
    return { ok: false, resourceCount: 0, vwapCount: 0, snapshotPath: null, durationMs: Date.now() - start, error: msg };
  }

  try {
    logger.info(`[realm ${realm}] Fetching VWAPs...`);
    vwaps = await fetchWithRetry(
      `getMarketVwaps(realm=${realm})`,
      () => client.getMarketVwaps(),
      retries,
      retryDelay,
    );
    logger.info(`[realm ${realm}] Fetched ${vwaps.length} VWAPs`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[realm ${realm}] Failed to fetch VWAPs`, msg);
    return { ok: false, resourceCount: resources.length, vwapCount: 0, snapshotPath: null, durationMs: Date.now() - start, error: msg };
  }

  const timestamp = new Date().toISOString();
  const snapshot: MarketSnapshot = {
    t: timestamp,
    r: realm,
    rc: shrinkResources(resources),
    vw: shrinkVwaps(vwaps),
  };

  if (!cfg.featureFlags.enableSnapshotWrite) {
    return { ok: true, resourceCount: resources.length, vwapCount: vwaps.length, snapshotPath: null, durationMs: Date.now() - start };
  }

  const safeTimestamp = timestamp.replace(/:/g, "-");
  const subDir = `snapshots/market/realm-${realm}`;

  try {
    const filePath = await writer.writeSnapshot(
      { timestamp: safeTimestamp, snapshotType: "market-snapshot", data: snapshot },
      subDir,
    );

    const elapsed = Date.now() - start;
    logger.info(`[realm ${realm}] Fetch complete in ${elapsed}ms – ${resources.length} resources, ${vwaps.length} VWAPs`);
    return { ok: true, resourceCount: resources.length, vwapCount: vwaps.length, snapshotPath: filePath, durationMs: elapsed };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[realm ${realm}] Failed to write snapshot`, msg);
    return { ok: false, resourceCount: resources.length, vwapCount: vwaps.length, snapshotPath: null, durationMs: Date.now() - start, error: msg };
  }
}

export async function runFetch(): Promise<FetchResult> {
  const start = Date.now();
  const cfg = loadConfig();

  if (!cfg.featureFlags.enableMarketFetch) {
    logger.warn("Market fetch disabled by feature flag");
    return { ok: false, resourceCount: 0, vwapCount: 0, snapshotPath: null, durationMs: Date.now() - start, error: "disabled by feature flag" };
  }

  const results = await Promise.allSettled(cfg.simco.realms.map((r) => runFetchForRealm(r)));

  let totalOk = 0;
  let totalResources = 0;
  let totalVwaps = 0;
  let lastError: string | undefined;

  for (const result of results) {
    if (result.status === "fulfilled" && result.value.ok) {
      totalOk++;
      totalResources += result.value.resourceCount;
      totalVwaps += result.value.vwapCount;
    } else if (result.status === "rejected") {
      lastError = result.reason?.message ?? String(result.reason);
    } else if (result.status === "fulfilled") {
      lastError = result.value.error;
    }
  }

  const elapsed = Date.now() - start;
  const allOk = totalOk === cfg.simco.realms.length;
  logger.info(`Fetch all realms: ${totalOk}/${cfg.simco.realms.length} OK, ${totalResources} resources, ${totalVwaps} VWAPs in ${elapsed}ms`);

  return {
    ok: allOk,
    resourceCount: totalResources,
    vwapCount: totalVwaps,
    snapshotPath: null,
    durationMs: elapsed,
    error: allOk ? undefined : lastError,
  };
}
