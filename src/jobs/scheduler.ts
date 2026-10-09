import { loadConfig } from "../config/index.js";
import { logger } from "../logging/logger.js";
import { runFetch, runFetchForRealm } from "./fetchJob.js";
import { runAggregation } from "./aggregate.js";
import { retentionCleanup } from "./cleanup.js";
import { runCompression } from "./compress.js";
import { recordFetchResult, getFailureStatus } from "./failureTracker.js";
import { emit } from "../events/eventBus.js";
import { runPublicExportPipeline } from "./publicExportPipeline.js";
import { runAllProfitMargins } from "./profitMargins.js";
import { runAllHistorySync } from "./macroHistory.js";
import { runAllGovernmentOrders } from "./governmentOrders.js";

let shuttingDown = false;
let schedulerRunning = false;
let schedulerStartedAt = 0;

export function isSchedulerRunning(): boolean {
  return schedulerRunning;
}

export function getSchedulerUptime(): number {
  if (!schedulerRunning) return 0;
  return Date.now() - schedulerStartedAt;
}

export function shutdown(): void {
  shuttingDown = true;
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ${s % 60}s`;
}

let lastCompressCycle = 1;
let lastGovernmentOrdersCycle = 0;
let lastGovernmentOrdersFetchDate = '';

export async function startScheduler(): Promise<void> {
  const cfg = loadConfig();
  const intervalMs = Math.max(60_000, cfg.schedules.fetchIntervalMinutes * 60 * 1000);
  let cycle = 0;
  const startedAt = Date.now();
  schedulerRunning = true;
  schedulerStartedAt = startedAt;

  logger.info("========================================");
  logger.info("Scheduler started");
  logger.info(`  realms:         [${cfg.simco.realms.join(", ")}]`);
  logger.info(`  interval:       ${cfg.schedules.fetchIntervalMinutes} min (${intervalMs} ms)`);
  logger.info(`  retention:      ${cfg.schedules.snapshotRetentionDays} days`);
  logger.info(`  compress:       every ${cfg.schedules.compressionIntervalDays} days`);
  logger.info(`  macro:          realmMetrics=${cfg.macroSettings.enableRealmMetrics}, priceIndexes=${cfg.macroSettings.enablePriceIndexes}, inflation=${cfg.macroSettings.enableInflationTracking}, profitMargins=${cfg.macroSettings.enableProfitMargins}`);
  logger.info(`  macro-history:  ${cfg.macroHistory.enableHistoryIngestion ? "enabled" : "disabled"}, backfill=${cfg.macroHistory.enableBackfill}, lookback=${cfg.macroHistory.backfillLookbackDays}d`);
    logger.info(`  government orders: ${cfg.governmentOrders.enableGovernmentOrders ? "enabled" : "disabled"}, day=${cfg.governmentOrders.fetchDayOfWeek}, time=${cfg.governmentOrders.fetchHourUtc}:${cfg.governmentOrders.fetchMinuteUtc.toString().padStart(2, "0")} UTC`);
    logger.info(`  commit-push:    ${cfg.featureFlags.enableCommitPush}`);
  logger.info(`  alerting:       ${cfg.featureFlags.enableAlerting}`);
  logger.info(`  aggregation:    ${cfg.featureFlags.enableAggregation}`);
  logger.info(`  analytics:      ${cfg.featureFlags.enableAnalytics}`);
  logger.info(`  cleanup:        ${cfg.featureFlags.enableRetentionCleanup}`);
  logger.info(`  compression:    ${cfg.featureFlags.enableCompression}`);
  logger.info("========================================");


  while (!shuttingDown) {
    cycle++;
    const cycleStart = Date.now();
    logger.info(`--- Cycle ${cycle} ---`);

    emit("scheduler:cycle-start", { cycle });

    const fetchResult = await runFetch();
    recordFetchResult(fetchResult.ok);
    emit("fetch:complete", { ok: fetchResult.ok, cycle, resources: fetchResult.resourceCount, vwaps: fetchResult.vwapCount });

    const failureStatus = getFailureStatus(cfg.schedules.consecutiveFailureThreshold);

    if (failureStatus.consecutive >= cfg.schedules.consecutiveFailureThreshold) {
      logger.error(`FAILURE THRESHOLD EXCEEDED: ${failureStatus.consecutive} consecutive failures`);
    }

    if (cfg.featureFlags.enableCommitPush && process.env.SYNC_SECRET) {
          logger.info("Sync: data pushed to Data repo via external GitHub Action pull");
        }

        // Parallelize realm processing where possible
        if (cfg.featureFlags.enableAggregation) {
          const aggResults = await Promise.allSettled(
            cfg.simco.realms.map(async (realm) => {
              const aggResult = await runAggregation(cfg.dataRepo.path, realm);
              if (!aggResult.ok) logger.warn(`[realm ${realm}] Aggregation skipped`, aggResult.error ?? "");
              return { realm, ...aggResult };
            })
          );
  
          const aggFailures = aggResults.filter(r => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok));
          if (aggFailures.length > 0) {
            logger.warn(`Aggregation had ${aggFailures.length}/${cfg.simco.realms.length} failures`);
          }
        }

        if (cfg.macroSettings.enableProfitMargins) {
          try {
            const profitResult = await runAllProfitMargins();
            if (!profitResult.ok) {
              logger.warn("Profit margins pipeline had failures");
            }
          } catch (err) {
            logger.error('Profit margins pipeline failed', err);
          }
        }

        // Run history sync in parallel
        if (cfg.macroHistory.enableHistoryIngestion) {
          try {
            const historyResult = await runAllHistorySync();
            if (!historyResult.ok) {
              logger.warn("History sync pipeline had failures");
            }
          } catch (err) {
            logger.error('History sync pipeline failed', err);
          }
        }

        // Government orders (once per week on Wednesday after 13:00 UTC)
        const todayStr = new Date().toISOString().slice(0, 10);
        if (cfg.governmentOrders.enableGovernmentOrders && shouldFetchGovernmentOrders(cfg) && lastGovernmentOrdersFetchDate !== todayStr) {
          lastGovernmentOrdersFetchDate = todayStr;
          try {
            const govResult = await runAllGovernmentOrders();
            if (!govResult.ok) {
              logger.warn("Government orders pipeline had failures");
            }
          } catch (err) {
            logger.error('Government orders pipeline failed', err);
          }
        }



    // Public dataset export (every cycle)
    try {
      const exportResult = await runPublicExportPipeline();
      if (!exportResult.ok) {
        logger.warn("Public export pipeline had failures", exportResult.errors.join(", "));
      }
    } catch (err) {
      logger.error('Public export pipeline failed', err);
    }


    if (cfg.featureFlags.enableCompression && cycle - lastCompressCycle >= getCompressIntervalCycles(cfg.schedules.compressionIntervalDays, cfg.schedules.fetchIntervalMinutes)) {
      try {
        for (const realm of cfg.simco.realms) {
          const compressResult = runCompression(cfg.dataRepo.path, realm, cfg.schedules.snapshotRetentionDays);
          if (!compressResult.ok) logger.warn(`[realm ${realm}] Compression failed`, compressResult.error ?? "");
        }
        lastCompressCycle = cycle;
      } catch (err) {
        logger.error('Compression pipeline failed', err);
      }
    }

    const cycleElapsed = Date.now() - cycleStart;
    const totalElapsed = Date.now() - startedAt;
    logger.info(`--- Cycle ${cycle} done in ${cycleElapsed}ms (uptime: ${formatUptime(totalElapsed)}) ---`);

    emit("scheduler:cycle-end", { cycle, cycleElapsed, uptime: totalElapsed, ok: fetchResult.ok });

    if (shuttingDown) break;

    logger.info(`Next fetch in ${cfg.schedules.fetchIntervalMinutes} min`);

    await sleep(intervalMs);
  }

  schedulerRunning = false;
  logger.info("Scheduler stopped gracefully");
}

function getCompressIntervalCycles(intervalDays: number, fetchMinutes: number): number {
  const cyclesPerDay = (24 * 60) / fetchMinutes;
  return Math.max(1, Math.round(intervalDays * cyclesPerDay));
}

function shouldFetchGovernmentOrders(cfg: ReturnType<typeof loadConfig>): boolean {
  if (!cfg.governmentOrders.enableGovernmentOrders) return false;
  
  const now = new Date();
  const currentDay = now.getUTCDay(); // 0=Sunday, 3=Wednesday
  const currentHour = now.getUTCHours();
  const currentMinute = now.getUTCMinutes();
  
  const targetDay = cfg.governmentOrders.fetchDayOfWeek;
  const targetHour = cfg.governmentOrders.fetchHourUtc;
  const targetMinute = cfg.governmentOrders.fetchMinuteUtc;
  
  // Check if it's the correct day and time has passed
  if (currentDay !== targetDay) return false;
  if (currentHour < targetHour) return false;
  if (currentHour === targetHour && currentMinute < targetMinute) return false;
  
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
