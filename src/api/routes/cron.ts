import { IncomingMessage, ServerResponse } from "http";
import { timingSafeEqual } from "crypto";
import { sendSuccess, sendError } from "../middleware.js";
import { loadConfig } from "../../config/index.js";
import { logger } from "../../logging/logger.js";
import { runFetch } from "../../jobs/fetchJob.js";
import { runAggregation } from "../../jobs/aggregate.js";
import { retentionCleanup } from "../../jobs/cleanup.js";
import { runCompression } from "../../jobs/compress.js";
import { runPublicExportPipeline } from "../../jobs/publicExportPipeline.js";
import { runAllProfitMargins } from "../../jobs/profitMargins.js";
import { runAllHistorySync } from "../../jobs/macroHistory.js";
import { runAllGovernmentOrders } from "../../jobs/governmentOrders.js";
import { runFetchRestaurantRetailInfo } from "../../jobs/restaurantRetailInfo.js";
import { DataRepoWriter } from "../../storage/dataRepoWriter.js";
import { getGithubToken } from "../connectAuth.js";
import { recordFetchResult } from "../../jobs/failureTracker.js";
import { githubFetch } from "../../storage/dataRepoWriter.js";

const CYCLE_COUNTER_PATH = "meta/scheduler-cycle.json";

function checkSecret(req: IncomingMessage): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return true;
  const auth = req.headers.authorization ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  const provided = Buffer.from(auth.slice(7));
  const expectedBuf = Buffer.from(expected);
  if (provided.length !== expectedBuf.length) return false;
  return timingSafeEqual(provided, expectedBuf);
}

async function loadCycleCounter(cfg: ReturnType<typeof loadConfig>): Promise<number> {
  if (!cfg.dataRepo.githubToken) return 0;
  try {
    const api = `https://api.github.com/repos/${cfg.dataRepo.owner}/${cfg.dataRepo.repo}`;
    const headers = {
      Authorization: `Bearer ${cfg.dataRepo.githubToken}`,
      "Content-Type": "application/json",
      "User-Agent": "SimcoIntel-Backend",
      Accept: "application/vnd.github.v3+json",
    };
    const res = await githubFetch(`${api}/contents/${CYCLE_COUNTER_PATH}?ref=${cfg.dataRepo.branch}`, { headers });
    if (res.ok) {
      const data = await res.json() as { content: string };
      const content = Buffer.from(data.content, "base64").toString("utf-8");
      const parsed = JSON.parse(content);
      return parsed.cycle ?? 0;
    }
  } catch {
    // Counter doesn't exist yet or error reading
  }
  return 0;
}

async function saveCycleCounter(cfg: ReturnType<typeof loadConfig>, cycle: number): Promise<void> {
  if (!cfg.dataRepo.githubToken) return;
  
  try {
    const api = `https://api.github.com/repos/${cfg.dataRepo.owner}/${cfg.dataRepo.repo}`;
    const headers = {
      Authorization: `Bearer ${cfg.dataRepo.githubToken}`,
      "Content-Type": "application/json",
      "User-Agent": "SimcoIntel-Backend",
      Accept: "application/vnd.github.v3+json",
    };
    
    // Get existing SHA if file exists
    let sha: string | null = null;
    try {
      const res = await githubFetch(`${api}/contents/${CYCLE_COUNTER_PATH}?ref=${cfg.dataRepo.branch}`, { headers: { Authorization: `Bearer ${cfg.dataRepo.githubToken}`, Accept: "application/vnd.github.v3+json" } });
      if (res.ok) {
        const data = await res.json() as { sha: string };
        sha = data.sha;
      }
    } catch {
      // Ignore SHA fetch errors
    }

    const body: Record<string, unknown> = {
      message: `Update scheduler cycle counter: ${cycle}`,
      content: Buffer.from(JSON.stringify({ cycle, updatedAt: new Date().toISOString() }, null, 2), "utf-8").toString("base64"),
      branch: cfg.dataRepo.branch,
    };
    if (sha) {
      (body as any).sha = sha;
    }

    const res = await githubFetch(`${api}/contents/${CYCLE_COUNTER_PATH}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${cfg.dataRepo.githubToken}`, "Content-Type": "application/json", "User-Agent": "SimcoIntel-Backend", Accept: "application/vnd.github.v3+json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      logger.warn(`Cron: Failed to save cycle counter: ${res.status} ${text}`);
    }
  } catch (err) {
    logger.warn("Cron: Failed to save cycle counter", err);
  }
}

function shouldFetchGovernmentOrders(cfg: ReturnType<typeof loadConfig>): boolean {
  if (!cfg.governmentOrders.enableGovernmentOrders) return false;
  
  const now = new Date();
  const currentDay = now.getUTCDay();
  const currentHour = now.getUTCHours();
  const currentMinute = now.getUTCMinutes();
  
  const targetDay = cfg.governmentOrders.fetchDayOfWeek;
  const targetHour = cfg.governmentOrders.fetchHourUtc;
  const targetMinute = cfg.governmentOrders.fetchMinuteUtc;
  
  if (currentDay !== targetDay) return false;
  if (currentHour < targetHour) return false;
  if (currentHour === targetHour && currentMinute < targetMinute) return false;
  
  return true;
}

export async function handleTriggerFetch(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!checkSecret(req)) {
    sendError(res, 401, "Unauthorized");
    return;
  }

  const cfg = loadConfig();
  const token = await getGithubToken();
  if (!token) {
    sendError(res, 400, "No GitHub token available");
    return;
  }

  const api = `https://api.github.com/repos/${cfg.dataRepo.owner}/${cfg.dataRepo.repo}/dispatches`;
  try {
    const ghRes = await githubFetch(api, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "SimcoIntel-Backend",
        Accept: "application/vnd.github.everest-preview+json",
      },
      body: JSON.stringify({ event_type: "sync-trigger" }),
    });

    if (!ghRes.ok) {
      const text = await ghRes.text();
      logger.warn(`GitHub dispatch failed: ${ghRes.status} ${text}`);
      sendError(res, 502, `GitHub dispatch failed: ${ghRes.status}`);
      return;
    }

    logger.info("GitHub dispatch triggered: sync-trigger → Data repo");
    sendSuccess(res, { ok: true, event: "sync-trigger" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`GitHub dispatch error: ${msg}`);
    sendError(res, 502, `GitHub dispatch error: ${msg}`);
  }
}

export async function handleCronCycle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!checkSecret(req)) {
    sendError(res, 401, "Unauthorized");
    return;
  }

  let cfg;
  try {
    cfg = loadConfig();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("loadConfig failed in cron cycle", err);
    sendError(res, 500, `Config load failed: ${msg}`);
    return;
  }

  // Load persisted cycle counter
  const cycle = await loadCycleCounter(cfg);
  const cycleNumber = cycle + 1;
  logger.info(`[Cron Cycle ${cycleNumber}] Starting...`);

  const results: Record<string, unknown> = {};
  const errors: string[] = [];

  try {
    const fetchResult = await runFetch();
    recordFetchResult(fetchResult.ok);
    results.fetch = { ok: fetchResult.ok, resources: fetchResult.resourceCount, vwaps: fetchResult.vwapCount };
  } catch (err) {
    errors.push("fetch: " + (err instanceof Error ? err.message : String(err)));
  }

  for (const realm of cfg.simco.realms) {
    if (cfg.featureFlags.enableAggregation) {
      try {
        const aggResult = await runAggregation(cfg.dataRepo.path, realm);
        results[`aggregate-${realm}`] = { ok: aggResult.ok };
        if (!aggResult.ok) errors.push(`aggregate-${realm}: ${aggResult.error ?? "unknown"}`);
      } catch (err) {
        errors.push(`aggregate-${realm}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  const pipelines: [string, () => Promise<{ ok: boolean; durationsMs?: { total?: number } }>][] = [
    ["profit-margins", () => cfg.macroSettings.enableProfitMargins ? runAllProfitMargins() : Promise.resolve({ ok: true })],
    ["history-sync", () => cfg.macroHistory.enableHistoryIngestion ? runAllHistorySync() : Promise.resolve({ ok: true })],
  ];

  for (const [name, fn] of pipelines) {
    try {
      const result = await fn();
      results[name] = { ok: result.ok };
      if (!result.ok) errors.push(`${name} pipeline failed`);
    } catch (err) {
      errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Government orders (once per week on Wednesday after 13:00 UTC)
  try {
    if (cfg.governmentOrders.enableGovernmentOrders && shouldFetchGovernmentOrders(cfg)) {
      const govResult = await runAllGovernmentOrders();
      results["government-orders"] = { ok: govResult.ok };
      if (!govResult.ok) errors.push("government-orders: pipeline failed");
    } else {
      results["government-orders"] = { ok: true, skipped: true };
    }
  } catch (err) {
    errors.push(`government-orders: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Restaurant retail info (every 4 cycles = ~6 hours with default 90min interval)
  const isRestaurantCycle = cycleNumber % 4 === 0;
  if (isRestaurantCycle) {
    try {
      logger.info(`[Cron Cycle ${cycleNumber}] Running restaurant retail info job (every 4th cycle)...`);
      const restaurantResult = await runFetchRestaurantRetailInfo();
      results["restaurant-retail-info"] = { ok: restaurantResult.ok, count: restaurantResult.count };
      if (!restaurantResult.ok) errors.push(`restaurant-retail-info: ${restaurantResult.error ?? "unknown"}`);
    } catch (err) {
      errors.push(`restaurant-retail-info: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    logger.debug(`[Cron Cycle ${cycleNumber}] Skipping restaurant retail info (cycle ${cycleNumber} % 4 = ${cycleNumber % 4})`);
    results["restaurant-retail-info"] = { ok: true, skipped: true };
  }

  try {
    const exportResult = await runPublicExportPipeline();
    results["public-export"] = { ok: exportResult.ok };
    if (!exportResult.ok) errors.push("public-export: " + exportResult.errors.join(", "));
  } catch (err) {
    errors.push("public-export: " + (err instanceof Error ? err.message : String(err)));
  }

  if (cfg.featureFlags.enableCompression) {
    for (const realm of cfg.simco.realms) {
      try {
        const compressResult = runCompression(cfg.dataRepo.path, realm, cfg.schedules.snapshotRetentionDays);
        results[`compress-${realm}`] = { ok: compressResult.ok };
        if (!compressResult.ok) errors.push(`compress-${realm}: ${compressResult.error ?? "unknown"}`);
      } catch (err) {
        errors.push(`compress-${realm}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  if (cfg.featureFlags.enableRetentionCleanup) {
    try {
      const cleanupResult = retentionCleanup(cfg.dataRepo.path, cfg.schedules.snapshotRetentionDays);
      results.cleanup = { ok: cleanupResult.ok };
      if (!cleanupResult.ok) errors.push(`cleanup: ${cleanupResult.error ?? "unknown"}`);
    } catch (err) {
      errors.push(`cleanup: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (cfg.featureFlags.enableCommitPush) {
    try {
      const writer = new DataRepoWriter(cfg.dataRepo);
      await writer.commitAndPush(`cron cycle and public export`);
      results["commit-push"] = { ok: true };
    } catch (err) {
      errors.push(`commit-push: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Save cycle counter (fire-and-forget)
  saveCycleCounter(cfg, cycleNumber).catch(err => logger.warn("Cron: Cycle counter save failed", err));

  logger.info(`Cron cycle ${cycleNumber} done — ${errors.length} errors`);
  sendSuccess(res, { cycle: cycleNumber, results, errors });
}