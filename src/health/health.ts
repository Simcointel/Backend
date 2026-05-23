import { loadConfig } from "../config/index.js";
import { logger } from "../logging/logger.js";
import { SimcoToolsClient } from "../api/simcoTools.js";
import { readdirSync, existsSync } from "fs";
import { resolve } from "path";
import { getFailureStatus } from "../jobs/failureTracker.js";
import { isSchedulerRunning, getSchedulerUptime } from "../jobs/scheduler.js";

export interface HealthReport {
  status: "ok" | "degraded" | "error";
  timestamp: string;
  uptime: string;
  checks: {
    config: { ok: boolean; detail: string };
    simcoToolsApi: { ok: boolean; detail: string };
    dataRepo: { ok: boolean; detail: string };
    failures: { ok: boolean; consecutive: number; threshold: number };
  };
  realms: number[];
  priceIndexFiles: Record<string, number>;
  inflationFiles: Record<string, number>;
}

export async function generateHealthReport(): Promise<HealthReport> {
  const ts = new Date().toISOString();

  const cfg = loadConfig();

  let configOk = true;
  let configDetail = "Loaded OK";
  try {
    configDetail = `realms=[${cfg.simco.realms.join(",")}], logLevel=${cfg.logging.level}`;
  } catch (err) {
    configOk = false;
    configDetail = err instanceof Error ? err.message : String(err);
  }

  let apiOk = false;
  let apiDetail = "Not checked";
  try {
    const results = await Promise.allSettled(
      cfg.simco.realms.map(async (r) => {
        const client = new SimcoToolsClient(r, cfg.simco.apiBaseUrl, 5000);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
          const resources = await client.getResources(true);
          clearTimeout(timer);
          const count = resources.resources?.length ?? 0;
          return { realm: r, ok: count > 0, detail: `${count} resources` };
        } catch {
          clearTimeout(timer);
          return { realm: r, ok: false, detail: "timeout or error" };
        }
      }),
    );

    const details: string[] = [];
    let allOk = true;
    for (const r of results) {
      if (r.status === "fulfilled") {
        details.push(`r${r.value.realm}=${r.value.ok ? "OK" : "FAIL"}(${r.value.detail})`);
        if (!r.value.ok) allOk = false;
      } else {
        details.push("r?=ERR");
        allOk = false;
      }
    }
    apiOk = allOk;
    apiDetail = details.join(", ");
  } catch (err) {
    apiDetail = err instanceof Error ? err.message : String(err);
  }

  const dataRepoPath = resolve(cfg.dataRepo.path);
  const dataRepoOk = existsSync(dataRepoPath);
  let dataRepoDetail = dataRepoOk
    ? `Path: ${dataRepoPath}`
    : `Path missing: ${dataRepoPath}`;

  const priceIndexFiles: Record<string, number> = {};
  const inflationFiles: Record<string, number> = {};
  if (dataRepoOk) {
    for (const r of cfg.simco.realms) {
      const piDir = resolve(dataRepoPath, `aggregates/indexes/realm-${r}`);
      const infDir = resolve(dataRepoPath, `aggregates/inflation/realm-${r}`);
      if (existsSync(piDir)) priceIndexFiles[String(r)] = readdirSync(piDir).filter(f => f.startsWith("price-indexes-") && f.endsWith(".json")).length;
      else priceIndexFiles[String(r)] = 0;
      if (existsSync(infDir)) inflationFiles[String(r)] = readdirSync(infDir).filter(f => f.startsWith("inflation-report-") && f.endsWith(".json")).length;
      else inflationFiles[String(r)] = 0;
    }
    dataRepoDetail += `, priceIndexFiles=${Object.values(priceIndexFiles).join(",")}, inflationFiles=${Object.values(inflationFiles).join(",")}`;
  }

  const failureThreshold = cfg.schedules.consecutiveFailureThreshold;
  const failures = getFailureStatus(failureThreshold);

  const checks = {
    config: { ok: configOk, detail: configDetail },
    simcoToolsApi: { ok: apiOk, detail: apiDetail },
    dataRepo: { ok: dataRepoOk, detail: dataRepoDetail },
    failures: { ok: failures.ok, consecutive: failures.consecutive, threshold: failures.threshold },
  };

  const allOk = configOk && apiOk && dataRepoOk && failures.ok;
  const status: HealthReport["status"] = allOk
    ? "ok"
    : apiOk
      ? "degraded"
      : "error";

  const uptime = isSchedulerRunning() ? formatDuration(getSchedulerUptime()) : "scheduler not running";

  const report: HealthReport = { status, timestamp: ts, uptime, checks, realms: cfg.simco.realms, priceIndexFiles, inflationFiles };
  return report;
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ${s % 60}s`;
}

export function printHealthSync(): void {
  const ts = new Date().toISOString();

  let cfgStatus = "ERROR";
  let cfgDetail = "";
  try {
    const cfg = loadConfig();
    cfgStatus = "OK";
    cfgDetail = `realms=[${cfg.simco.realms.join(",")}], logLevel=${cfg.logging.level}`;
  } catch (err) {
    cfgDetail = err instanceof Error ? err.message : String(err);
  }

  const dataRepoPath = resolve(loadConfig().dataRepo.path);
  const dataRepoOk = existsSync(dataRepoPath);

  console.log(`Simco Intel Backend – Health Check`);
  console.log(`Timestamp: ${ts}`);
  console.log(`config:     ${cfgStatus} – ${cfgDetail}`);
  console.log(`data repo:  ${dataRepoOk ? "OK" : "MISSING"} – ${dataRepoPath}`);
  console.log(`(API check requires async; run "npm start" for full report)`);
}
