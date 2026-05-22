import { IncomingMessage, ServerResponse } from "http";
import { sendSuccess, sendError } from "../middleware.js";
import { loadConfig } from "../../config/index.js";
import { logger } from "../../logging/logger.js";
import { runFetch } from "../../jobs/fetchJob.js";
import { runAggregation } from "../../jobs/aggregate.js";
import { runExpandedAggregation } from "../../jobs/expandedAggregate.js";
import { retentionCleanup } from "../../jobs/cleanup.js";
import { runCompression } from "../../jobs/compress.js";
import { runMacroPipeline } from "../../jobs/macroPipeline.js";
import { runIntelligencePipeline } from "../../jobs/intelligencePipeline.js";
import { runRelationalPipeline } from "../../jobs/relationalPipeline.js";
import { runDashboardPipeline } from "../../jobs/dashboardPipeline.js";
import { runPublicExportPipeline } from "../../jobs/publicExportPipeline.js";
import { DataRepoWriter } from "../../storage/dataRepoWriter.js";
import { recordFetchResult } from "../../jobs/failureTracker.js";
import { updatePipelineRun } from "../../jobs/operationalStatus.js";

export async function handleCronCycle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const auth = req.headers.authorization;
  const cfg = loadConfig();
  const expected = process.env.CRON_SECRET;
  if (expected && auth !== `Bearer ${expected}`) {
    sendError(res, 401, "Unauthorized");
    return;
  }

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

    if (cfg.featureFlags.enableAnalytics) {
      try {
        const analyticResult = await runExpandedAggregation(cfg.dataRepo.path, realm, cfg.schedules.analyticsWindowSize);
        results[`analytics-${realm}`] = { ok: analyticResult.ok };
        if (!analyticResult.ok) errors.push(`analytics-${realm}: ${analyticResult.error ?? "unknown"}`);
      } catch (err) {
        errors.push(`analytics-${realm}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  const pipelines: [string, () => Promise<{ ok: boolean; durationsMs?: { total?: number } }>][] = [
    ["macro", () => runMacroPipeline()],
    ["intelligence", () => runIntelligencePipeline()],
    ["relational", () => runRelationalPipeline()],
    ["dashboard", () => runDashboardPipeline()],
  ];

  for (const [name, fn] of pipelines) {
    try {
      const result = await fn();
      results[name] = { ok: result.ok };
      updatePipelineRun(name, result.ok, result.durationsMs?.total ?? 0);
      if (!result.ok) errors.push(`${name} pipeline failed`);
    } catch (err) {
      errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  try {
    const exportResult = runPublicExportPipeline();
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
      } catch (err) {
        errors.push(`compress-${realm}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  if (cfg.featureFlags.enableRetentionCleanup) {
    try {
      const cleanupResult = retentionCleanup(cfg.dataRepo.path, cfg.schedules.snapshotRetentionDays);
      results.cleanup = { ok: cleanupResult.ok };
    } catch (err) {
      errors.push("cleanup: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  if (cfg.featureFlags.enableCommitPush) {
    try {
      const writer = new DataRepoWriter(cfg.dataRepo);
      await writer.commitAndPush(`cron cycle`);
    } catch (err) {
      errors.push("commit-push: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  logger.info(`Cron cycle done — ${errors.length} errors`);
  sendSuccess(res, { results, errors });
}
