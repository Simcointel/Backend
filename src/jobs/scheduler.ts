import { loadConfig } from "../config/index.js";
import { logger } from "../logging/logger.js";
import { runFetch, runFetchForRealm } from "./fetchJob.js";
import { runAggregation } from "./aggregate.js";
import { runExpandedAggregation } from "./expandedAggregate.js";
import { retentionCleanup } from "./cleanup.js";
import { runCompression } from "./compress.js";
import { recordFetchResult, getFailureStatus } from "./failureTracker.js";
import { sendFailureAlert } from "./alerter.js";
import { runMacroPipeline } from "./macroPipeline.js";
import { runIntelligencePipeline } from "./intelligencePipeline.js";
import { runRelationalPipeline } from "./relationalPipeline.js";
import { runDashboardPipeline } from "./dashboardPipeline.js";
import { updatePipelineRun } from "./operationalStatus.js";
import { emit } from "../events/eventBus.js";
import { runPublicExportPipeline } from "./publicExportPipeline.js";
import { runAllBackfillVWAP } from "./backfillVWAP.js";

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

let lastCompressCycle = 0;

export async function startScheduler(): Promise<void> {
  const cfg = loadConfig();
  const intervalMs = cfg.schedules.fetchIntervalMinutes * 60 * 1000;
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
  logger.info(`  analytics:      window=${cfg.schedules.analyticsWindowSize}`);
  logger.info(`  macro:          realmMetrics=${cfg.macroSettings.enableRealmMetrics}, priceIndexes=${cfg.macroSettings.enablePriceIndexes}, inflation=${cfg.macroSettings.enableInflationTracking}`);
  logger.info(`  macro-history:  ${cfg.macroHistory.enableHistoryIngestion ? "enabled" : "disabled"}, backfill=${cfg.macroHistory.enableBackfill}, lookback=${cfg.macroHistory.backfillLookbackDays}d`);
  logger.info(`  commit-push:    ${cfg.featureFlags.enableCommitPush}`);
  logger.info(`  alerting:       ${cfg.featureFlags.enableAlerting}`);
  logger.info(`  aggregation:    ${cfg.featureFlags.enableAggregation}`);
  logger.info(`  analytics:      ${cfg.featureFlags.enableAnalytics}`);
  logger.info(`  cleanup:        ${cfg.featureFlags.enableRetentionCleanup}`);
  logger.info(`  compression:    ${cfg.featureFlags.enableCompression}`);
  logger.info(`  intelligence:   ${cfg.intelligence.enableRealmIntelligence ? "enabled" : "disabled"}`);
  logger.info("========================================");

  runAllBackfillVWAP().then(result => {
    if (result.ok) {
      const total = result.results.reduce((s, r) => s + r.datesProcessed, 0);
      if (total > 0) logger.info(`VWAP backfill: ${total} dates processed across ${result.results.length} realms`);
      else logger.info("VWAP backfill: all dates already filled (no-op)");
    } else {
      logger.warn("VWAP backfill had errors — check logs");
    }
  }).catch(err => {
    logger.warn(`VWAP backfill failed: ${err instanceof Error ? err.message : err}`);
  });

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

      if (cfg.featureFlags.enableAlerting && cfg.alerts.webhookUrl) {
        await sendFailureAlert(cfg.alerts.webhookUrl, failureStatus.consecutive, failureStatus.threshold);
      }
    }

    if (cfg.featureFlags.enableCommitPush && process.env.SYNC_SECRET) {
      logger.info("Sync: data pushed to Data repo via external GitHub Action pull");
    }

    for (const realm of cfg.simco.realms) {
      if (cfg.featureFlags.enableAggregation) {
        const aggResult = await runAggregation(cfg.dataRepo.path, realm);
        if (!aggResult.ok) logger.warn(`[realm ${realm}] Aggregation skipped`, aggResult.error ?? "");
      }

      if (cfg.featureFlags.enableAnalytics) {
        const analyticResult = await runExpandedAggregation(cfg.dataRepo.path, realm, cfg.schedules.analyticsWindowSize);
        if (!analyticResult.ok) logger.warn(`[realm ${realm}] Analytics skipped`, analyticResult.error ?? "");
      }
    }

    const macroResult = await runMacroPipeline();
    if (!macroResult.ok) {
      logger.warn("Macro pipeline had failures");
    }

    if (cfg.featureFlags.enableRetentionCleanup) {
      const cleanupResult = retentionCleanup(cfg.dataRepo.path, cfg.schedules.snapshotRetentionDays);
      if (!cleanupResult.ok) logger.warn("Cleanup reported error", cleanupResult.error ?? "");
    }

    const intelResult = await runIntelligencePipeline();
    if (!intelResult.ok) {
      logger.warn("Intelligence pipeline had failures");
    }

    const relResult = await runRelationalPipeline();
    if (!relResult.ok) {
      logger.warn("Relational pipeline had failures");
    }

    const dashResult = await runDashboardPipeline();
    if (!dashResult.ok) {
      logger.warn("Dashboard pipeline had failures");
    }

    // Public dataset export (every cycle)
    const exportResult = runPublicExportPipeline();
    if (!exportResult.ok) {
      logger.warn("Public export pipeline had failures", exportResult.errors.join(", "));
    }

    updatePipelineRun("macro", macroResult.ok, macroResult.durationsMs.total);
    updatePipelineRun("intelligence", intelResult.ok, intelResult.durationsMs.total);
    updatePipelineRun("relational", relResult.ok, relResult.durationsMs.total);
    updatePipelineRun("dashboard", dashResult.ok, dashResult.durationsMs.total);

    if (cfg.featureFlags.enableCompression && cycle - lastCompressCycle >= getCompressIntervalCycles(cfg.schedules.compressionIntervalDays, cfg.schedules.fetchIntervalMinutes)) {
      for (const realm of cfg.simco.realms) {
        const compressResult = runCompression(cfg.dataRepo.path, realm, cfg.schedules.snapshotRetentionDays);
        if (!compressResult.ok) logger.warn(`[realm ${realm}] Compression failed`, compressResult.error ?? "");
      }
      lastCompressCycle = cycle;
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
