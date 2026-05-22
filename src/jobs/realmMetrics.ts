import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import { SimcoToolsClient, type RealmStatus } from "../api/simcoTools.js";
import { DataRepoWriter } from "../storage/dataRepoWriter.js";

export interface RealmMetricsResult {
  ok: boolean;
  realm: number;
  status: RealmStatus["summary"] | null;
  durationMs: number;
  error?: string;
}

export async function runRealmMetrics(realm: number): Promise<RealmMetricsResult> {
  const start = Date.now();
  const cfg = loadConfig();
  const client = new SimcoToolsClient(realm, cfg.simco.apiBaseUrl);

  try {
    const status = await client.getRealmStatus();
    const elapsed = Date.now() - start;

    const writer = new DataRepoWriter({ path: cfg.dataRepo.path, githubToken: "", owner: "", repo: "", branch: "main" });
    const timestamp = new Date().toISOString().replace(/:/g, "-");
    const subDir = `aggregates/realm-status/realm-${realm}`;

    const macroSnapshot = {
      t: status.summary.date,
      f: timestamp.replace(/-/g, ":"),
      r: realm,
      ac: status.summary.activeCompanies,
      cv: status.summary.companiesValue,
      tb: status.summary.totalBuildings,
      bs: status.summary.bondsSold,
      ph: status.summary.phase,
      cp: status.summary.completed,
    };

    await writer.writeSnapshot(
      { timestamp, snapshotType: "realm-status", data: macroSnapshot },
      subDir,
    );

    logger.info(`[realm ${realm}] Realm metrics: ${status.summary.activeCompanies} companies, value=${status.summary.companiesValue}`);
    return { ok: true, realm, status: status.summary, durationMs: elapsed };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[realm ${realm}] Realm metrics failed: ${msg}`);
    return { ok: false, realm, status: null, durationMs: Date.now() - start, error: msg };
  }
}

export async function runAllRealmMetrics(): Promise<{ ok: boolean; results: RealmMetricsResult[] }> {
  const cfg = loadConfig();
  const results = await Promise.allSettled(
    cfg.simco.realms.map((r) => runRealmMetrics(r)),
  );

  const fulfilled: RealmMetricsResult[] = [];
  let allOk = true;
  for (const r of results) {
    if (r.status === "fulfilled") {
      fulfilled.push(r.value);
      if (!r.value.ok) allOk = false;
    } else {
      allOk = false;
    }
  }

  return { ok: allOk, results: fulfilled };
}
