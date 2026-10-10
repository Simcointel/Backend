import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { loadConfig, reloadConfig } from "../config/index.js";
import { setLogLevel } from "../logging/logger.js";
import { logger } from "../logging/logger.js";
import { runFetch } from "../jobs/fetchJob.js";
import { runAggregation } from "../jobs/aggregate.js";
import { retentionCleanup } from "../jobs/cleanup.js";
import { runCompression } from "../jobs/compress.js";
import { generateHealthReport } from "../health/health.js";
import { getFailureStatus } from "../jobs/failureTracker.js";
import { runAllGovernmentOrders } from "../jobs/governmentOrders.js";
import { runPublicExportPipeline } from "../jobs/publicExportPipeline.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface AdminAction {
  action: string;
  ok: boolean;
  result: unknown;
  error?: string;
}

export async function executeAction(action: string, params?: Record<string, unknown>): Promise<AdminAction> {
  const cfg = loadConfig();
  console.log(`[executeAction] START action=${action}`);

  switch (action) {
    case "fetch":
      console.log(`[executeAction] fetch: calling runFetch`);
      const fetchResult = await runFetch();
      console.log(`[executeAction] fetch: runFetch returned`);
      return { action, ok: true, result: fetchResult };

    case "aggregate": {
      const realm = (params?.realm as number) ?? cfg.simco.realms[0];
      console.log(`[executeAction] aggregate: realm=${realm}`);
      const result = await runAggregation(cfg.dataRepo.path, realm);
      console.log(`[executeAction] aggregate: runAggregation returned`);
      return { action, ok: result.ok, result };
    }

    case "cleanup": {
      const dryRun = (params?.dryRun as boolean) ?? false;
      console.log(`[executeAction] cleanup: dryRun=${dryRun}`);
      const result = retentionCleanup(cfg.dataRepo.path, cfg.schedules.snapshotRetentionDays, dryRun);
      console.log(`[executeAction] cleanup: retentionCleanup returned`);
      return { action, ok: result.ok, result };
    }

    case "compress": {
      const realm = (params?.realm as number) ?? cfg.simco.realms[0];
      const retentionDays = (params?.retentionDays as number) ?? 1;
      const dryRun = (params?.dryRun as boolean) ?? false;
      console.log(`[executeAction] compress: realm=${realm}, retentionDays=${retentionDays}, dryRun=${dryRun}`);
      const result = runCompression(cfg.dataRepo.path, realm, retentionDays, dryRun);
      console.log(`[executeAction] compress: runCompression returned`);
      return { action, ok: result.ok, result };
    }

    case "government-orders": {
      console.log(`[executeAction] government-orders: calling runAllGovernmentOrders`);
      const result = await runAllGovernmentOrders();
      console.log(`[executeAction] government-orders: runAllGovernmentOrders returned`);
      // Push to data repo so web frontend can access via GitHub CDN
      try {
        const exportResult = await runPublicExportPipeline();
        console.log(`[executeAction] government-orders: export pipeline returned ${exportResult.files.length} files`);
        return { action, ok: result.ok && exportResult.ok, result: { report: result.reports ?? result.results, errors: exportResult.errors } };
      } catch (exportErr) {
        console.error(`[executeAction] government-orders: export pipeline failed`, exportErr);
        return { action, ok: false, result: { report: result.reports ?? result.results, errors: [exportErr instanceof Error ? exportErr.message : String(exportErr)] } };
      }
    }

    case "public-export": {
      console.log(`[executeAction] public-export: calling runPublicExportPipeline`);
      const result = await runPublicExportPipeline();
      console.log(`[executeAction] public-export: runPublicExportPipeline returned`);
      return { action, ok: result.ok, result };
    }

    case "status": {
      console.log(`[executeAction] status: calling generateHealthReport`);
      const health = await generateHealthReport();
      console.log(`[executeAction] status: generateHealthReport returned`);
      const failures = getFailureStatus(cfg.schedules.consecutiveFailureThreshold);
      console.log(`[executeAction] status: getFailureStatus returned`);
      return { action, ok: true, result: { health, failures, realms: cfg.simco.realms } };
    }

    case "reload-config": {
      console.log(`[executeAction] reload-config: calling reloadConfig`);
      reloadConfig();
      console.log(`[executeAction] reload-config: reloadConfig returned`);
      logger.info("Config reloaded");
      return { action, ok: true, result: "config reloaded" };
    }

    case "get-config": {
      console.log(`[executeAction] get-config: start`);
      const { dataRepo, logging, schedules, formulas, featureFlags, alerts } = cfg;
      console.log(`[executeAction] get-config: building result`);
      const result = {
        action,
        ok: true,
        result: {
          realms: cfg.simco.realms,
          logging, schedules, formulas, featureFlags,
          alerts: { webhookUrl: alerts.webhookUrl ? "(set)" : "(empty)" },
          dataRepo: { ...dataRepo, githubToken: dataRepo.githubToken ? "(set)" : "(empty)" },
        },
      };
      console.log(`[executeAction] get-config: returning result`);
      return result;
    }

    case "update-config": {
      const section = params?.section as string;
      const values = params?.values as Record<string, unknown>;
      if (!section || !values) {
        return { action, ok: false, result: null, error: "section and values required" };
      }

      const configPaths = [
        resolve(process.cwd(), "config"),
        resolve(__dirname, "..", "..", "config"),
        resolve(__dirname, "..", "..", "..", "config"),
      ];

      const configDir = configPaths[0];
      const filePath = resolve(configDir, `${section}.json`);

      if (!existsSync(filePath)) {
        return { action, ok: false, result: null, error: `config section '${section}' not found` };
      }

      const current = JSON.parse(readFileSync(filePath, "utf-8"));
      const merged = { ...current, ...values };
      writeFileSync(filePath, JSON.stringify(merged, null, 2) + "\n", "utf-8");
      reloadConfig();

      logger.info(`Config '${section}' updated:`, JSON.stringify(values));
      return { action, ok: true, result: `'${section}' updated` };
    }

    case "set-log-level": {
      const level = params?.level as string;
      if (!["debug", "info", "warn", "error"].includes(level)) {
        return { action, ok: false, result: null, error: `invalid log level: ${level}` };
      }
      setLogLevel(level as "debug" | "info" | "warn" | "error");
      return { action, ok: true, result: `log level set to ${level}` };
    }

    default:
      return { action, ok: false, result: null, error: `unknown action: ${action}` };
  }
}
