import { loadConfig } from "../config/index.js";
import { logger } from "../logging/logger.js";
import { SimcoToolsClient, checkApiHealth } from "../api/simcoTools.js";
import { existsSync } from "fs";
import { resolve } from "path";
import { getFailureStatus } from "../jobs/failureTracker.js";

export interface HealthReport {
  status: "ok" | "degraded" | "error";
  timestamp: string;
  checks: {
    config: { ok: boolean; detail: string };
    simcoToolsApi: { ok: boolean; detail: string };
    dataRepo: { ok: boolean; detail: string };
    failures: { ok: boolean; consecutive: number; threshold: number };
  };
  realms: number[];
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
        const client = new SimcoToolsClient(r);
        const result = await checkApiHealth(client);
        return { realm: r, ok: result.ok, detail: result.detail };
      }),
    );

    const details: string[] = [];
    let allOk = true;
    for (const r of results) {
      if (r.status === "fulfilled") {
        details.push(`r${r.value.realm}=${r.value.ok ? "OK" : "FAIL"}`);
        if (!r.value.ok) allOk = false;
      } else {
        details.push("ERR");
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
  const dataRepoDetail = dataRepoOk
    ? `Path exists: ${dataRepoPath}`
    : `Path missing: ${dataRepoPath}`;

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

  const report: HealthReport = { status, timestamp: ts, checks, realms: cfg.simco.realms };
  logger.info("Health report", JSON.stringify(report, null, 2));
  return report;
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
