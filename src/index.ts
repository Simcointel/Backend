import { loadConfig } from "./config/index.js";
import { setLogLevel } from "./logging/logger.js";
import { logger } from "./logging/logger.js";
import { generateHealthReport, printHealthSync } from "./health/health.js";
import { runFetch } from "./jobs/fetchJob.js";
import { startScheduler, shutdown } from "./jobs/scheduler.js";
import { runAggregation } from "./jobs/aggregate.js";
import { runExpandedAggregation } from "./jobs/expandedAggregate.js";
import { retentionCleanup } from "./jobs/cleanup.js";
import { runCompression } from "./jobs/compress.js";
import { getFailureStatus } from "./jobs/failureTracker.js";
import { executeAction } from "./admin/index.js";
import { startServer } from "./api/server.js";
import { envNumber } from "./config/env.js";
import { runMacroPipeline } from "./jobs/macroPipeline.js";
import { runAllRealmMetrics } from "./jobs/realmMetrics.js";
import { runAllPriceIndexes } from "./jobs/priceIndex.js";
import { runAllInflationTracking } from "./jobs/macroInflation.js";
import { runAllHistorySync, runAllBackfills, runAllMacroArchives } from "./jobs/macroHistory.js";
import { runIntelligencePipeline } from "./jobs/intelligencePipeline.js";
import { runRelationalPipeline } from "./jobs/relationalPipeline.js";
import { runDashboardPipeline } from "./jobs/dashboardPipeline.js";
import { runPublicExportPipeline } from "./jobs/publicExportPipeline.js";
import { initSseEventBus } from "./api/sse.js";

async function main() {
  const cfg = loadConfig();
  setLogLevel(cfg.logging.level);

  const args = process.argv.slice(2);

  if (args.includes("health")) {
    if (args.includes("--async")) {
      const report = await generateHealthReport();
      console.log(JSON.stringify(report, null, 2));
    } else {
      printHealthSync();
    }
    return;
  }

  if (args.includes("fetch")) {
    const result = await runFetch();
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok && result.error !== "disabled by feature flag") {
      process.exit(1);
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
      console.log(JSON.stringify({ realm, ...result }, null, 2));
    }
    return;
  }

  if (args.includes("analytics")) {
    for (const realm of cfg.simco.realms) {
      const result = await runExpandedAggregation(cfg.dataRepo.path, realm, cfg.schedules.analyticsWindowSize);
      console.log(JSON.stringify({ realm, ...result }, null, 2));
    }
    return;
  }

  if (args.includes("compress")) {
    const dryRun = args.includes("--dry-run");
    for (const realm of cfg.simco.realms) {
      const result = runCompression(cfg.dataRepo.path, realm, cfg.schedules.snapshotRetentionDays, dryRun);
      console.log(JSON.stringify({ realm, ...result }, null, 2));
    }
    return;
  }

  if (args.includes("cleanup")) {
    const dryRun = args.includes("--dry-run");
    const result = retentionCleanup(cfg.dataRepo.path, cfg.schedules.snapshotRetentionDays, dryRun);
    console.log(JSON.stringify({ ...result, dryRun }, null, 2));
    return;
  }

  if (args.includes("macro")) {
    const result = await runMacroPipeline();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.includes("realm-status")) {
    const result = await runAllRealmMetrics();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.includes("price-indexes")) {
    const result = await runAllPriceIndexes();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.includes("inflation")) {
    const result = await runAllInflationTracking();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.includes("macro-history")) {
    const result = await runAllHistorySync();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.includes("macro-backfill")) {
    const result = await runAllBackfills();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.includes("macro-archive")) {
    const dryRun = args.includes("--dry-run");
    const result = runAllMacroArchives(dryRun);
    console.log(JSON.stringify({ ...result, dryRun }, null, 2));
    return;
  }

  if (args.includes("intelligence")) {
    const result = await runIntelligencePipeline();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.includes("relational") && !args.includes("correlations") && !args.includes("anomalies") && !args.includes("divergence") && !args.includes("contagion") && !args.includes("alerts")) {
    const result = await runRelationalPipeline();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.includes("dashboard") && args.includes("--help")) {
    console.log(JSON.stringify({ message: "Use: dashboard-summary, dashboard-state, dashboard-health, dashboard-events, dashboard-alerts, dashboard-sectors, dashboard-system" }));
    return;
  }

  if (args.includes("dashboard")) {
    const result = await runDashboardPipeline();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.includes("public-export")) {
    const result = runPublicExportPipeline();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.includes("correlations")) {
    const { computeAllCorrelations } = await import("./jobs/correlationEngine.js");
    const result = await computeAllCorrelations();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.includes("anomalies")) {
    const { detectAllAnomalies } = await import("./jobs/anomalyEngine.js");
    const result = await detectAllAnomalies();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.includes("divergence")) {
    const { detectAllDivergences } = await import("./jobs/divergenceEngine.js");
    const result = await detectAllDivergences();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.includes("contagion")) {
    const { detectAllContagion } = await import("./jobs/contagionEngine.js");
    const result = await detectAllContagion();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.includes("alerts")) {
    const { loadEvents } = await import("./jobs/alertEngine.js");
    const cfg = loadConfig();
    for (const r of cfg.simco.realms) {
      const events = loadEvents(r);
      console.log(JSON.stringify({ realm: r, total: events.length, events }, null, 2));
    }
    return;
  }

  if (args.includes("momentum")) {
    const { computeAllMomentum } = await import("./jobs/momentumEngine.js");
    const result = await computeAllMomentum();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.includes("volatility")) {
    const { computeAllVolatility } = await import("./jobs/volatilityEngine.js");
    const result = await computeAllVolatility();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.includes("intel-stress")) {
    const { computeAllStress } = await import("./jobs/stressEngine.js");
    const result = await computeAllStress();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.includes("regime")) {
    const { computeAllRegimes } = await import("./jobs/regimeEngine.js");
    const result = await computeAllRegimes();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.includes("leaders")) {
    const { computeAllLeaders } = await import("./jobs/commodityIntelligence.js");
    const result = await computeAllLeaders();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.includes("sectors")) {
    const { computeAllSectors } = await import("./jobs/commodityIntelligence.js");
    const result = await computeAllSectors();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.includes("status")) {
    const report = await generateHealthReport();
    const failures = getFailureStatus(cfg.schedules.consecutiveFailureThreshold);
    console.log(JSON.stringify({ health: report, failures }, null, 2));
    return;
  }

  if (args.includes("admin")) {
    const idx = args.indexOf("admin");
    const action = args[idx + 1];
    const paramsArg = args[idx + 2];
    let params: Record<string, unknown> | undefined;

    if (paramsArg) {
      try {
        params = JSON.parse(paramsArg);
      } catch {
        params = {};
        for (const kv of args.slice(idx + 2)) {
          const eqIdx = kv.indexOf("=");
          if (eqIdx > 0) {
            params[kv.slice(0, eqIdx)] = kv.slice(eqIdx + 1);
          }
        }
      }
    }

    if (action) {
      const result = await executeAction(action, params);
      console.log(JSON.stringify(result, null, 2));
    }
    return;
  }

  if (args.includes("server")) {
    initSseEventBus();
    const port = envNumber("HTTP_PORT", 3001);
    startServer(port);
    return;
  }

  logger.info("Simco Intel Backend");
  logger.info(`realms=[${cfg.simco.realms.join(",")}], logLevel=${cfg.logging.level}`);
  logger.info(`dataRepo.path=${cfg.dataRepo.path}`);
  logger.info(`featureFlags=${JSON.stringify(cfg.featureFlags)}`);
  logger.info("");
  logger.info("Commands:");
  logger.info("  fetch                 Run one fetch cycle (all realms)");
  logger.info("  scheduler             Run continuous scheduler");
  logger.info("  aggregate             Run per-realm snapshot summary");
  logger.info("  analytics             Run multi-snapshot trend analytics");
  logger.info("  compress              Archive old snapshots");
  logger.info("  compress --dry-run    Preview archivable snapshots");
  logger.info("  cleanup               Delete old snapshots");
  logger.info("  cleanup --dry-run     Preview deletable snapshots");
  logger.info("  macro                 Run full macro pipeline");
  logger.info("  realm-status          Fetch realm economy status");
  logger.info("  price-indexes         Compute commodity price indexes");
  logger.info("  inflation             Track category inflation");
  logger.info("  macro-history         Sync realm history (incremental)");
  logger.info("  macro-backfill        Full historical backfill");
  logger.info("  macro-archive         Archive old macro history years");
  logger.info("  macro-archive --dry-run Preview macro archival");
  logger.info("  intelligence          Run full intelligence pipeline");
  logger.info("  relational            Run full relational intelligence pipeline");
  logger.info("  dashboard             Run dashboard pipeline (summary + ops + alerts)");
  logger.info("  public-export         Generate public dataset exports");
  logger.info("  correlations          Compute category correlations");
  logger.info("  anomalies             Detect market anomalies");
  logger.info("  divergence            Detect sector divergences");
  logger.info("  contagion             Detect contagion signals");
  logger.info("  alerts                View historical alert events");
  logger.info("  momentum              Compute market momentum");
  logger.info("  volatility            Compute market volatility");
  logger.info("  intel-stress          Compute sector stress");
  logger.info("  regime                Compute economic regimes");
  logger.info("  leaders               Compute commodity leaders/losers");
  logger.info("  sectors               Compute combined sector view");
  logger.info("  status                Full status report");
  logger.info("  health                Quick health check");
  logger.info("  server                Start HTTP API server");
  logger.info("  admin <action> [json] Backend-ui admin hook");
  logger.info("");
  logger.info("Admin actions: fetch, aggregate, analytics, cleanup, compress,");
  logger.info("  status, reload-config, get-config, update-config, set-log-level");
}

main().catch((err) => {
  logger.error("Fatal startup error", err);
  process.exit(1);
});
