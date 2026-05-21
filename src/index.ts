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
import {
  runAllHistorySync,
  runAllBackfills,
  runAllMacroArchives,
} from "./jobs/macroHistory.js";
import { runIntelligencePipeline } from "./jobs/intelligencePipeline.js";
import { runRelationalPipeline } from "./jobs/relationalPipeline.js";
import { runDashboardPipeline } from "./jobs/dashboardPipeline.js";
import { runPublicExportPipeline } from "./jobs/publicExportPipeline.js";

/**
 * ---------------------------------------------------------
 * CLI ENTRY
 * ---------------------------------------------------------
 */

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
    process.on("SIGINT", () => {
      logger.info("Shutdown requested");
      shutdown();
    });

    process.on("SIGTERM", () => {
      logger.info("Shutdown requested");
      shutdown();
    });

    await startScheduler();
    return;
  }

  if (args.includes("aggregate")) {
    for (const realm of cfg.simco.realms) {
      const result = await runAggregation(cfg.dataRepo.path, realm);

      console.log(
        JSON.stringify(
          {
            realm,
            ...result,
          },
          null,
          2,
        ),
      );
    }

    return;
  }

  if (args.includes("analytics")) {
    for (const realm of cfg.simco.realms) {
      const result = await runExpandedAggregation(
        cfg.dataRepo.path,
        realm,
        cfg.schedules.analyticsWindowSize,
      );

      console.log(
        JSON.stringify(
          {
            realm,
            ...result,
          },
          null,
          2,
        ),
      );
    }

    return;
  }

  if (args.includes("compress")) {
    const dryRun = args.includes("--dry-run");

    for (const realm of cfg.simco.realms) {
      const result = runCompression(
        cfg.dataRepo.path,
        realm,
        cfg.schedules.snapshotRetentionDays,
        dryRun,
      );

      console.log(
        JSON.stringify(
          {
            realm,
            ...result,
          },
          null,
          2,
        ),
      );
    }

    return;
  }

  if (args.includes("cleanup")) {
    const dryRun = args.includes("--dry-run");

    const result = retentionCleanup(
      cfg.dataRepo.path,
      cfg.schedules.snapshotRetentionDays,
      dryRun,
    );

    console.log(
      JSON.stringify(
        {
          ...result,
          dryRun,
        },
        null,
        2,
      ),
    );

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

    console.log(
      JSON.stringify(
        {
          ...result,
          dryRun,
        },
        null,
        2,
      ),
    );

    return;
  }

  if (args.includes("intelligence")) {
    const result = await runIntelligencePipeline();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (
    args.includes("relational") &&
    !args.includes("correlations") &&
    !args.includes("anomalies") &&
    !args.includes("divergence") &&
    !args.includes("contagion") &&
    !args.includes("alerts")
  ) {
    const result = await runRelationalPipeline();
    console.log(JSON.stringify(result, null, 2));
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

  if (args.includes("status")) {
    const report = await generateHealthReport();
    const failures = getFailureStatus(
      cfg.schedules.consecutiveFailureThreshold,
    );

    console.log(
      JSON.stringify(
        {
          health: report,
          failures,
        },
        null,
        2,
      ),
    );

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
      }
    }

    if (action) {
      const result = await executeAction(action, params);
      console.log(JSON.stringify(result, null, 2));
    }

    return;
  }

  if (args.includes("server")) {
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
  process.exit(1);
});
