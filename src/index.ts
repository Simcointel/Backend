import { loadConfig } from "./config/index.js";
import { setLogLevel } from "./logging/logger.js";
import { logger } from "./logging/logger.js";
import { generateHealthReport, printHealthSync } from "./health/health.js";
import { runFetch } from "./jobs/fetchJob.js";
import { startScheduler, shutdown } from "./jobs/scheduler.js";
import { runAggregation } from "./jobs/aggregate.js";
import { retentionCleanup } from "./jobs/cleanup.js";
import { runCompression } from "./jobs/compress.js";
import { getFailureStatus } from "./jobs/failureTracker.js";
import { executeAction } from "./admin/index.js";
import { startServer } from "./api/server.js";
import { envNumber } from "./config/env.js";
import { runPublicExportPipeline } from "./jobs/publicExportPipeline.js";
import { runMacroPipeline } from "./jobs/macroPipeline.js";
import { runAllRealmMetrics } from "./jobs/realmMetrics.js";
import { runAllPriceIndexes } from "./jobs/priceIndex.js";
import { runAllInflationTracking } from "./jobs/macroInflation.js";
import { runAllHistorySync, runAllBackfills, runAllMacroArchives } from "./jobs/macroHistory.js";

async function main() {
  const logJson = (obj: unknown) => logger.info(JSON.stringify(obj, null, 2));

  const cfg = loadConfig();
  setLogLevel(cfg.logging.level);

  const args = process.argv.slice(2);

  if (args.includes("health")) {
    if (args.includes("--async")) {
      const report = await generateHealthReport();
      logJson(report);
    } else {
      printHealthSync();
    }
    return;
  }

  if (args.includes("fetch")) {
    const result = await runFetch();
    logJson(result);
    if (!result.ok && result.error !== "disabled by feature flag") {
      logger.error("Fetch failed");
    }
    return;
  }

  if (args.includes("scheduler") || args.includes("watch")) {
    process.on("SIGINT", () => { logger.info("Shutdown requested"); shutdown(); });
    process.on("SIGTERM", () => { logger.info("Shutdown requested"); shutdown(); });
    await startScheduler();
    return;
  }

  if (args.includes("aggregate")) {
    for (const realm of cfg.simco.realms) {
      const result = await runAggregation(cfg.dataRepo.path, realm);
      logJson({ realm, ...result });
    }
    return;
  }

  if (args.includes("compress")) {
    const dryRun = args.includes("--dry-run");
    for (const realm of cfg.simco.realms) {
      const result = runCompression(cfg.dataRepo.path, realm, cfg.schedules.snapshotRetentionDays, dryRun);
      logJson({ realm, ...result });
    }
    return;
  }

  if (args.includes("cleanup")) {
    const dryRun = args.includes("--dry-run");
    const result = retentionCleanup(cfg.dataRepo.path, cfg.schedules.snapshotRetentionDays, dryRun);
    logJson({ ...result, dryRun });
    return;
  }

  const cmd = args[1];
  const dryRun = args.includes("--dry-run");

  if (cmd === "public-export") {
    const result = await runPublicExportPipeline();
    logJson(result);
    return;
  }

  if (cmd === "macro") {
    logJson(await runMacroPipeline());
    return;
  }

  if (cmd === "realm-status") {
    logJson(await runAllRealmMetrics());
    return;
  }

  if (cmd === "price-indexes") {
    logJson(await runAllPriceIndexes());
    return;
  }

  if (cmd === "inflation") {
    logJson(await runAllInflationTracking());
    return;
  }

  if (cmd === "macro-history") {
    logJson(await runAllHistorySync());
    return;
  }

  if (cmd === "macro-backfill") {
    logJson(await runAllBackfills());
    return;
  }

  if (cmd === "macro-archive") {
    logJson(runAllMacroArchives(dryRun));
    return;
  }

  if (cmd === "status") {
    const report = await generateHealthReport();
    const failures = getFailureStatus(cfg.schedules.consecutiveFailureThreshold);
    logJson({ health: report, failures });
    return;
  }

  if (cmd === "admin") {
    const action = args[2];
    const paramsArg = args[3];
    let params: Record<string, unknown> | undefined;
    if (paramsArg) {
      try { params = JSON.parse(paramsArg); } catch { params = {}; }
    }
    if (action) {
      const result = await executeAction(action, params);
      logJson(result);
    }
    return;
  }

  if (cmd === "server") {
    const port = envNumber("HTTP_PORT", 3001);
    startServer(port);
    return;
  }

  logger.info("SimcoIntel Backend");
  logger.info(`realms=[${cfg.simco.realms.join(",")}]`);
  logger.info(`dataRepo.path=${cfg.dataRepo.path}`);
}

main().catch((err) => {
  logger.error("Fatal startup error", err);
});
