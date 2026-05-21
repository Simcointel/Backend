import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { loadConfig, reloadConfig } from "../config/index.js";
import { setLogLevel } from "../logging/logger.js";
import { logger } from "../logging/logger.js";
import { runFetch } from "../jobs/fetchJob.js";
import { runAggregation } from "../jobs/aggregate.js";
import { runExpandedAggregation } from "../jobs/expandedAggregate.js";
import { retentionCleanup } from "../jobs/cleanup.js";
import { runCompression } from "../jobs/compress.js";
import { generateHealthReport } from "../health/health.js";
import { getFailureStatus } from "../jobs/failureTracker.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface AdminAction {
  action: string;
  ok: boolean;
  result: unknown;
  error?: string;
}

export async function executeAction(action: string, params?: Record<string, unknown>): Promise<AdminAction> {
  const cfg = loadConfig();

  switch (action) {
    case "fetch":
      return { action, ok: true, result: await runFetch() };

    case "aggregate": {
      const realm = (params?.realm as number) ?? cfg.simco.realms[0];
      const result = await runAggregation(cfg.dataRepo.path, realm);
      return { action, ok: result.ok, result };
    }

    case "analytics": {
      const realm = (params?.realm as number) ?? cfg.simco.realms[0];
      const windowSize = (params?.windowSize as number) ?? cfg.schedules.analyticsWindowSize;
      const result = await runExpandedAggregation(cfg.dataRepo.path, realm, windowSize);
      return { action, ok: result.ok, result };
    }

    case "cleanup": {
      const dryRun = (params?.dryRun as boolean) ?? false;
      const result = retentionCleanup(cfg.dataRepo.path, cfg.schedules.snapshotRetentionDays, dryRun);
      return { action, ok: result.ok, result };
    }

    case "compress": {
      const realm = (params?.realm as number) ?? cfg.simco.realms[0];
      const retentionDays = (params?.retentionDays as number) ?? 1;
      const dryRun = (params?.dryRun as boolean) ?? false;
      const result = runCompression(cfg.dataRepo.path, realm, retentionDays, dryRun);
      return { action, ok: result.ok, result };
    }

    case "status": {
      const health = await generateHealthReport();
      const failures = getFailureStatus(cfg.schedules.consecutiveFailureThreshold);
      return { action, ok: true, result: { health, failures, realms: cfg.simco.realms } };
    }

    case "reload-config":
      reloadConfig();
      logger.info("Config reloaded");
      return { action, ok: true, result: "config reloaded" };

    case "get-config": {
      const { dataRepo, logging, schedules, formulas, featureFlags, alerts } = cfg;
      return {
        action,
        ok: true,
        result: {
          realms: cfg.simco.realms,
          logging, schedules, formulas, featureFlags,
          alerts: { webhookUrl: alerts.webhookUrl ? "(set)" : "(empty)" },
          dataRepo: { ...dataRepo, githubToken: dataRepo.githubToken ? "(set)" : "(empty)" },
        },
      };
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

    case "intelligence": {
      const { runIntelligencePipeline } = await import("../jobs/intelligencePipeline.js");
      const result = await runIntelligencePipeline();
      return { action, ok: result.ok, result };
    }

    case "relational": {
      const { runRelationalPipeline } = await import("../jobs/relationalPipeline.js");
      const result = await runRelationalPipeline();
      return { action, ok: result.ok, result };
    }

    case "dashboard": {
      const { runDashboardPipeline } = await import("../jobs/dashboardPipeline.js");
      const result = await runDashboardPipeline();
      return { action, ok: result.ok, result };
    }

    default:
      return { action, ok: false, result: null, error: `unknown action: ${action}` };
  }
}
